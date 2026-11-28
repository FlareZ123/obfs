'use strict';

const path=require('node:path');

// Keep node:sqlite lazy: the default in-memory SCO admission path should not
// load an experimental native module or affect unrelated Node/browser builds.

/**
 * A nonce must record the issuer's principal generation to invalidate
 * mid-flight assertions after principal-wide session revocation.
 * @typedef {{principal:string,sessionId:string,challenge:Buffer,
 *   expiresAt:number,version:number}} ScoWebAuthnChallenge
 */

/**
 * Synchronous admission-state boundary. Each method that must be atomic is a
 * *single* state transition. No method may return a Promise; a durable
 * implementation cannot split consumption/minting across an await.
 *
 * @typedef {{
 *  insertChallenge:(id:string,principal:string,sessionId:string,challenge:Buffer,
 *    expiresAt:number,now:number,maxChallenges:number)=>void,
 *  consumeChallenge:(id:string)=>ScoWebAuthnChallenge|null,
 *  generation:(principal:string)=>number,
 *  mintSession:(token:string,principal:string,expiresAt:number,
 *    challengeGeneration:number,now:number,maxSessions:number)=>boolean,
 *  authorizeSession:(token:string,principal:string,now:number)=>boolean,
 *  revokeSession:(token:string)=>boolean,
 *  revokePrincipal:(principal:string)=>void
 * }} ScoWebAuthnStateStore
 */

/**
 * Fast, process-local state: default for a single trusted SCO server. Its
 * semantics match the durable store interface, but the maps cannot coordinate
 * clustered Node workers. Never mistake process-local tests for a replica
 * correctness proof.
 *
 * @returns {ScoWebAuthnStateStore}
 */
function createScoWebAuthnMemoryStore(){
  /** @type {Map<string,ScoWebAuthnChallenge>} */
  const challenges=new Map();
  /** @type {Map<string,{principal:string,expiresAt:number}>} */
  const sessions=new Map();
  /** @type {Map<string,number>} */
  const versions=new Map();

  /** @param {number} time */
  function purge(time){
    for(const [id,row] of challenges)if(row.expiresAt<=time)challenges.delete(id);
    for(const [id,row] of sessions)if(row.expiresAt<=time)sessions.delete(id);
  }
  /** @param {string} principal @returns {number} */
  const generation=principal=>versions.get(principal)??0;
  /** @type {ScoWebAuthnStateStore} */
  const store={
    insertChallenge(id,principal,sessionId,challenge,expiresAt,now,maxChallenges){
      purge(now);
      if(challenges.size>=maxChallenges)throw new Error('WebAuthn challenge capacity exhausted');
      if(challenges.has(id))throw new Error('Duplicate WebAuthn challenge nonce');
      challenges.set(id,{principal,sessionId,challenge:Buffer.from(challenge),
        expiresAt,version:generation(principal)});
    },
    consumeChallenge(id){
      const row=challenges.get(id);
      if(row)challenges.delete(id);
      return row??null;
    },
    generation,
    mintSession(token,principal,expiresAt,challengeGeneration,now,maxSessions){
      purge(now);
      if(generation(principal)!==challengeGeneration||sessions.size>=maxSessions||
         expiresAt<=now ||sessions.has(token))return false;
      sessions.set(token,{principal,expiresAt});
      return true;
    },
    authorizeSession(token,principal,now){
      const row=sessions.get(token);
      if(!row)return false;
      if(row.expiresAt<=now){sessions.delete(token);return false;}
      return row.principal===principal;
    },
    revokeSession(token){return sessions.delete(token);},
    revokePrincipal(principal){
      const next=generation(principal)+1;
      if(!Number.isSafeInteger(next))throw new RangeError('WebAuthn principal generation exhausted');
      versions.set(principal,next);
      for(const [token,session] of sessions)if(session.principal===principal)sessions.delete(token);
      for(const [id,challenge] of challenges)if(challenge.principal===principal)challenges.delete(id);
    }
  };
  return store;
}

/** @typedef {{version:unknown}} GenerationRow */
/** @typedef {{principal:unknown,session_id:unknown,challenge:unknown,
 *  expires_at:unknown,version:unknown}} ChallengeRow */
/** @typedef {{principal:unknown,expires_at:unknown}} SessionRow */
/** @typedef {{total:unknown}} CountRow */

/** @param {unknown} value @param {string} field @returns {number} */
function safeStoredInteger(value,field){
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)
    throw new TypeError('Unsafe WebAuthn state-store integer: '+field);
  return value;
}

/**
 * Optional **single-host, cross-process** SQLite WAL store. Nonces are
 * consumed by one atomic DELETE ... RETURNING; session minting rechecks the
 * principal generation under BEGIN IMMEDIATE. Revoke increments generation
 * and deletes sessions/challenges under the same writer transaction.
 *
 * A local trusted database path with reliable SQLite locking is REQUIRED.
 * This is not a distributed database, a clustered/network-filesystem proof,
 * a credential-enrollment implementation or an SNO attacker boundary.
 * Initializing a fresh WAL database concurrently may require bounded
 * cold-start SQLITE_BUSY retries; any later unexpected error fails closed.
 *
 * @param {string} filename
 * @returns {ScoWebAuthnStateStore & {close:()=>void}}
 */
function createScoWebAuthnSqliteStore(filename){
  if(typeof filename!=='string'||!path.isAbsolute(filename)||
     path.normalize(filename)!==filename||filename.includes('\0'))
    throw new TypeError('Cross-process WebAuthn store requires an absolute normalized SQLite file path');
  const {DatabaseSync}=require('node:sqlite');
  const db=new DatabaseSync(filename,{timeout:30000});
  try{
    for(let attempt=0;;attempt++){
      try{db.exec('PRAGMA journal_mode=WAL;');break;}
      catch(error){
        if(!(error instanceof Error&&error.message==='database is locked')||attempt>=4)throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25*(2**attempt));
      }
    }
    db.exec('PRAGMA synchronous=FULL;');
    db.exec('PRAGMA trusted_schema=OFF;');
    db.exec(
      'CREATE TABLE IF NOT EXISTS obfs_wa_generation ('+
      'principal TEXT PRIMARY KEY, version INTEGER NOT NULL);'+
      'CREATE TABLE IF NOT EXISTS obfs_wa_challenge ('+
      'nonce TEXT PRIMARY KEY, principal TEXT NOT NULL,session_id TEXT NOT NULL,'+
      'challenge BLOB NOT NULL, expires_at INTEGER NOT NULL,version INTEGER NOT NULL);'+
      'CREATE TABLE IF NOT EXISTS obfs_wa_session ('+
      'token TEXT PRIMARY KEY,principal TEXT NOT NULL,expires_at INTEGER NOT NULL);'
    );
    const readGeneration=db.prepare('SELECT version FROM obfs_wa_generation WHERE principal=?');
    const insertGeneration=db.prepare(
      'INSERT INTO obfs_wa_generation(principal,version) VALUES(?,?) '+
      'ON CONFLICT(principal) DO UPDATE SET version=excluded.version');
    const deleteExpiredChallenges=db.prepare(
      'DELETE FROM obfs_wa_challenge WHERE expires_at<=?');
    const deleteExpiredSessions=db.prepare(
      'DELETE FROM obfs_wa_session WHERE expires_at<=?');
    const countChallenges=db.prepare('SELECT COUNT(*) AS total FROM obfs_wa_challenge');
    const countSessions=db.prepare('SELECT COUNT(*) AS total FROM obfs_wa_session');
    const insertChallenge=db.prepare(
      'INSERT INTO obfs_wa_challenge '+
      '(nonce,principal,session_id,challenge,expires_at,version) VALUES(?,?,?,?,?,?)');
    const consumeChallenge=db.prepare(
      'DELETE FROM obfs_wa_challenge WHERE nonce=? '+
      'RETURNING principal,session_id,challenge,expires_at,version');
    const insertSession=db.prepare(
      'INSERT INTO obfs_wa_session(token,principal,expires_at) VALUES(?,?,?)');
    const getSession=db.prepare(
      'SELECT principal,expires_at FROM obfs_wa_session WHERE token=?');
    const deleteSession=db.prepare('DELETE FROM obfs_wa_session WHERE token=?');
    const deletePrincipalSessions=db.prepare('DELETE FROM obfs_wa_session WHERE principal=?');
    const deletePrincipalChallenges=db.prepare('DELETE FROM obfs_wa_challenge WHERE principal=?');
    /** @param {string} principal @returns {number} */
    function generation(principal){
      const row=/** @type {GenerationRow|undefined} */ (
        /** @type {unknown} */ (readGeneration.get(principal))
      );
      return row?safeStoredInteger(row.version,'generation'):0;
    }
    /**
     * @template T
     * @param {()=>T} execute
     * @returns {T}
     */
    function writer(execute){
      db.exec('BEGIN IMMEDIATE;');
      try{
        const result=execute();
        db.exec('COMMIT;');
        return result;
      }catch(error){
        if(db.isTransaction)db.exec('ROLLBACK;');
        throw error;
      }
    }
    /**
     * @param {import('node:sqlite').StatementSync} statement
     * @returns {number}
     */
    function count(statement){
      const row=/** @type {CountRow|undefined} */(
        /** @type {unknown} */ (statement.get())
      );
      if(!row)throw new TypeError('Missing WebAuthn store count');
      return safeStoredInteger(row.total,'count');
    }
    /** @type {ScoWebAuthnStateStore & {close:()=>void}} */
    const store={
      insertChallenge(id,principal,sessionId,challenge,expiresAt,now,maxChallenges){
        writer(()=>{
          deleteExpiredChallenges.run(now);
          if(count(countChallenges)>=maxChallenges)
            throw new Error('WebAuthn challenge capacity exhausted');
          insertChallenge.run(id,principal,sessionId,challenge,expiresAt,generation(principal));
        });
      },
      consumeChallenge(id){
        // The DELETE statement itself is a transaction, even when two Node
        // processes race; only one receives the consumed row.
        const row=/** @type {ChallengeRow|undefined} */(
          /** @type {unknown} */ (consumeChallenge.get(id))
        );
        if(!row)return null;
        if(typeof row.principal!=='string'||typeof row.session_id!=='string'||
           !(row.challenge instanceof Uint8Array))
          throw new TypeError('Corrupt WebAuthn challenge row');
        return {principal:row.principal,sessionId:row.session_id,
          challenge:Buffer.from(row.challenge),
          expiresAt:safeStoredInteger(row.expires_at,'expires_at'),
          version:safeStoredInteger(row.version,'version')};
      },
      generation,
      mintSession(token,principal,expiresAt,challengeGeneration,now,maxSessions){
        return writer(()=>{
          if(generation(principal)!==challengeGeneration || expiresAt<=now)return false;
          deleteExpiredSessions.run(now);
          if(count(countSessions)>=maxSessions)return false;
          insertSession.run(token,principal,expiresAt);
          return true;
        });
      },
      authorizeSession(token,principal,now){
        const row=/** @type {SessionRow|undefined} */(
          /** @type {unknown} */ (getSession.get(token))
        );
        if(!row)return false;
        return row.principal===principal &&
          safeStoredInteger(row.expires_at,'session expires_at')>now;
      },
      revokeSession(token){
        return Number(deleteSession.run(token).changes)>0;
      },
      revokePrincipal(principal){
        writer(()=>{
          const next=generation(principal)+1;
          if(!Number.isSafeInteger(next))throw new RangeError('WebAuthn principal generation exhausted');
          insertGeneration.run(principal,next);
          deletePrincipalSessions.run(principal);
          deletePrincipalChallenges.run(principal);
        });
      },
      close(){db.close();}
    };
    return store;
  }catch(error){
    db.close();
    throw error;
  }
}

module.exports={createScoWebAuthnMemoryStore,createScoWebAuthnSqliteStore};
