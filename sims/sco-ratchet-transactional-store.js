'use strict';

const {DatabaseSync}=require('node:sqlite');
const {createHash,createHmac}=require('node:crypto');
const assert=require('node:assert/strict');

const WORK=Buffer.alloc(8*1024*1024,0x5b);

/**
 * @typedef {'fresh'|'cached'|'denied'} BatchKind
 * @typedef {{kind:BatchKind,outputs:string[],privateExecutions:number}} BatchDecision
 * @typedef {{seq:number,state:Uint8Array,last_start:number,last_fingerprint:string,
 *   last_outputs:string,committed:number}} StoredRow
 * @typedef {{root_hash:string}} ConfigurationRow
 */

/** @param {string[]} inputs @returns {string} */
function fingerprint(inputs){
  return createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
}

/** @param {Buffer} root @param {string} principal @returns {Buffer} */
function initialState(root,principal){
  return createHmac('sha256',root).update('ratchet-start-v1\0').update(principal).digest();
}

/** @param {Buffer} state @param {string} principal @param {number} seq
 * @param {string} input @returns {Buffer}
 */
function advance(state,principal,seq,input){
  return createHmac('sha256',state)
    .update('ratchet-step-v1\0').update(principal).update('\0')
    .update(String(seq)).update('\0').update(input)
    .update(WORK).digest();
}

/**
 * An experimental shared-file SQLite ratchet. DatabaseSync's BEGIN IMMEDIATE
 * acquires SQLite's cross-process writer lock before any state is inspected.
 * All protected HMAC work and its state publication occur in one transaction.
 * The transaction commits before a newly generated output is returned.
 *
 * This demonstration assumes a single, trusted, local database path with
 * reliable storage. It does not integrate a distributed database or HTTP
 * authentication, and the global writer lock can block unrelated accounts.
 */
class TransactionalRatchet{
  /**
   * @param {string} databasePath
   * @param {Buffer} root
   */
  constructor(databasePath,root){
    assert.equal(root.length,32,'Root key must be 256 bits');
    this.root=Buffer.from(root);
    this.db=new DatabaseSync(databasePath,{timeout:30000});
    // WAL allows concurrent readers. FULL synchronizes WAL commits before
    // reporting success under SQLite's documented filesystem assumptions.
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS ratchet_config ('+
      'id INTEGER PRIMARY KEY CHECK(id=1), root_hash TEXT NOT NULL);'+
      'CREATE TABLE IF NOT EXISTS ratchet_state ('+
      'principal TEXT PRIMARY KEY, seq INTEGER NOT NULL, state BLOB NOT NULL,'+
      'last_start INTEGER NOT NULL, last_fingerprint TEXT NOT NULL,'+
      'last_outputs TEXT NOT NULL, committed INTEGER NOT NULL);'
    );
    const hash=createHash('sha256').update(this.root).digest('hex');
    this.db.prepare('INSERT OR IGNORE INTO ratchet_config(id,root_hash) VALUES(1,?)').run(hash);
    const config=/** @type {ConfigurationRow} */(/** @type {unknown} */(
      this.db.prepare('SELECT root_hash FROM ratchet_config WHERE id=1').get()));
    if(config.root_hash!==hash){
      this.db.close();
      throw new TypeError('Ratchet root differs from the persisted source root');
    }
    this.readState=this.db.prepare(
      'SELECT seq,state,last_start,last_fingerprint,last_outputs,committed '+
      'FROM ratchet_state WHERE principal=?'
    );
    this.writeState=this.db.prepare(
      'INSERT INTO ratchet_state(principal,seq,state,last_start,last_fingerprint,'+
      'last_outputs,committed) VALUES(?,?,?,?,?,?,?) '+
      'ON CONFLICT(principal) DO UPDATE SET seq=excluded.seq,'+
      'state=excluded.state,last_start=excluded.last_start,'+
      'last_fingerprint=excluded.last_fingerprint,last_outputs=excluded.last_outputs,'+
      'committed=excluded.committed'
    );
  }

  /**
   * @param {string} principal Verified by the caller; this class is not auth.
   * @param {number} start
   * @param {string[]} inputs
   * @returns {BatchDecision}
   */
  batch(principal,start,inputs){
    if(typeof principal!=='string'||!principal.length||
       !Number.isSafeInteger(start)||start<0||
       !Array.isArray(inputs)||inputs.length<1||inputs.length>64||
       start+inputs.length>Number.MAX_SAFE_INTEGER||
       !inputs.every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value))){
      return {kind:'denied',outputs:[],privateExecutions:0};
    }
    const digest=fingerprint(inputs);
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const row=/** @type {StoredRow|undefined} */(/** @type {unknown} */(
        this.readState.get(principal)));
      if(row && row.last_start===start && row.last_fingerprint===digest){
        const outputs=/** @type {string[]} */(JSON.parse(row.last_outputs));
        this.db.exec('COMMIT');
        return {kind:'cached',outputs,privateExecutions:0};
      }
      const seq=row?.seq??0;
      if(seq!==start){
        this.db.exec('ROLLBACK');
        return {kind:'denied',outputs:[],privateExecutions:0};
      }
      /** @type {Buffer} */
      let state=row?Buffer.from(row.state):initialState(this.root,principal);
      /** @type {string[]} */
      const outputs=[];
      for(let i=0;i<inputs.length;i++){
        state=advance(state,principal,start+i,inputs[i]);
        outputs.push(state.toString('hex'));
      }
      this.writeState.run(
        principal,start+inputs.length,state,start,digest,
        JSON.stringify(outputs),(row?.committed??0)+inputs.length
      );
      this.db.exec('COMMIT');
      return {kind:'fresh',outputs,privateExecutions:inputs.length};
    }catch(error){
      if(this.db.isTransaction)this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** @param {string} principal @returns {{seq:number,committed:number}} */
  snapshot(principal){
    const row=/** @type {StoredRow|undefined} */(/** @type {unknown} */(
      this.readState.get(principal)));
    return {seq:row?.seq??0,committed:row?.committed??0};
  }

  /** @returns {void} */
  close(){
    this.db.close();
    this.root.fill(0);
  }
}

module.exports={TransactionalRatchet};
