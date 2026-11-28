'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createScoWebAuthnMemoryStore}=require('../src/sco-webauthn-state');

/** @typedef {import('../src/sco-webauthn-state').ScoWebAuthnStateStore} ScoWebAuthnStateStore */

/**
 * Historical linear-scan model from the immutable Agent 6 source pin.
 * Keep the reference independent of the production fast-path implementation.
 * @returns {ScoWebAuthnStateStore}
 */
function originalStore(){
  /** @type {Map<string,import('../src/sco-webauthn-state').ScoWebAuthnChallenge>} */
  const challenges=new Map();
  /** @type {Map<string,{principal:string,expiresAt:number}>} */
  const sessions=new Map();
  const versions=new Map();
  /** @type {string|null} */
  let policy=null;
  /** @param {number} time */
  function purge(time){
    for(const [id,row] of challenges)if(row.expiresAt<=time)challenges.delete(id);
    for(const [id,row] of sessions)if(row.expiresAt<=time)sessions.delete(id);
  }
  /** @param {string} principal */
  const generation=principal=>versions.get(principal)??0;
  return {
    insertChallenge(id,principal,sessionId,challenge,expiresAt,now,maxChallenges){
      purge(now);
      if(challenges.size>=maxChallenges)throw new Error('WebAuthn challenge capacity exhausted');
      if(challenges.has(id))throw new Error('Duplicate WebAuthn challenge nonce');
      challenges.set(id,{principal,sessionId,challenge:Buffer.from(challenge),expiresAt,version:generation(principal)});
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
         expiresAt<=now||sessions.has(token))return false;
      sessions.set(token,{principal,expiresAt});return true;
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
      for(const [token,row] of sessions)if(row.principal===principal)sessions.delete(token);
      for(const [id,row] of challenges)if(row.principal===principal)challenges.delete(id);
    },
    assertConfiguration(hash){
      if(typeof hash!=='string'||!/^[0-9a-f]{64}$/u.test(hash))
        throw new TypeError('Invalid SCO WebAuthn configuration fingerprint');
      if(policy===null){policy=hash;return;}
      if(policy!==hash)throw new TypeError('SCO WebAuthn replica configuration differs from shared memory policy');
    }
  };
}

/**
 * Compare effects, outputs, and refusal shapes after each state transition.
 * @param {ScoWebAuthnStateStore} baseline
 * @param {ScoWebAuthnStateStore} candidate
 * @param {keyof ScoWebAuthnStateStore} method
 * @param {any[]} args
 * @param {string} label
 */
function paired(baseline,candidate,method,args,label){
  // Methods that return values must be compared; exceptions stay in-band.
  /** @param {ScoWebAuthnStateStore} store */
  const invokeOutput=store=>{
    try{return {ok:true,output:/** @type {Function} */(store[method]).apply(store,args)};}
    catch(error){
      if(!(error instanceof Error))throw error;
      return {ok:false,name:error.name,message:error.message};
    }
  };
  assert.deepEqual(invokeOutput(candidate),invokeOutput(baseline),label);
}

test('ordered and out-of-order memory expiry behavior matches historical linear scan',()=>{
  const a=originalStore(),b=createScoWebAuthnMemoryStore();
  const buffer=Buffer.from('a');
  /** @param {keyof ScoWebAuthnStateStore} method @param {any[]} args */
  const call=(method,args)=>paired(a,b,method,args,method+' '+JSON.stringify(args));
  call('insertChallenge',['far','principal','session',buffer,100,0,2]);
  call('insertChallenge',['near','principal','session',buffer,10,0,2]);
  call('insertChallenge',['middle','principal','session',buffer,80,20,2]);
  call('consumeChallenge',['near']);
  call('consumeChallenge',['far']);
  call('consumeChallenge',['middle']);
  call('mintSession',['far-token','principal',500,0,100,2]);
  call('mintSession',['short-token','principal',150,0,100,2]);
  call('mintSession',['new-token','principal',800,0,200,2]);
  call('authorizeSession',['far-token','principal',200]);
  call('authorizeSession',['short-token','principal',200]);
  call('authorizeSession',['new-token','principal',200]);
  call('revokePrincipal',['principal']);
  call('authorizeSession',['new-token','principal',201]);
});

test('6000 seeded shared-memory admission transitions preserve state and error parity',()=>{
  let seed=0x8f41d231;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  const control=originalStore(),candidate=createScoWebAuthnMemoryStore();
  const hash='a'.repeat(64);
  paired(control,candidate,'assertConfiguration',[hash],'shared policy startup');
  let now=1_900_000_000_000;
  for(let i=0;i<6000;i++){
    now+=rand()%3;
    const principal=(rand()&1)?'a':'b';
    const method=rand()%7;
    /** @type {keyof ScoWebAuthnStateStore} */
    let name;
    /** @type {any[]} */
    let args;
    if(method===0){
      name='insertChallenge';
      args=['c'+(rand()%120),principal,'ceremony',
        Buffer.from([rand()&255]),now+(rand()%100)-25,now,64];
    }else if(method===1){
      name='consumeChallenge';args=['c'+(rand()%120)];
    }else if(method===2){
      name='mintSession';
      args=['t'+(rand()%150),principal,now+(rand()%180)-20,
        candidate.generation(principal),now,96];
    }else if(method===3){
      name='authorizeSession';args=['t'+(rand()%150),principal,now];
    }else if(method===4){
      name='revokeSession';args=['t'+(rand()%150)];
    }else if(method===5){
      name='revokePrincipal';args=[principal];
    }else{
      name='generation';args=[principal];
    }
    paired(control,candidate,name,args,'seed=0x8f41d231 step '+i+' method '+name);
  }
});

/**
 * Isolated CPU sample for the store housekeeping path. This intentionally
 * excludes ECDSA, HTTP and total app work; it is not a 2.5x SCO budget proof.
 * @param {ScoWebAuthnStateStore} store
 * @param {number} capacity
 * @returns {number} user+system CPU microseconds
 */
function sampleHousekeepingCpu(store,capacity){
  store.assertConfiguration('c'.repeat(64));
  const now=1_900_000_000_000;
  const challenge=Buffer.alloc(32,0x42);
  const before=process.cpuUsage();
  for(let i=0;i<capacity;i++){
    store.insertChallenge('nonce-'+i,'account','login',challenge,now+120_000,
      now,capacity);
    assert.equal(store.mintSession('token-'+i,'account',now+120_000,0,
      now,capacity),true);
  }
  const elapsed=process.cpuUsage(before);
  return elapsed.user+elapsed.system;
}

test('CPU receipt: full-capacity admission housekeeping versus linear historical control',()=>{
  /** @type {number[]} */
  const linearUs=[];
  /** @type {number[]} */
  const orderedUs=[];
  for(let i=0;i<5;i++){
    // AB/BA alternating order and separate fresh stores for every sample.
    const arms=i%2===0?['linear','ordered']:['ordered','linear'];
    for(const arm of arms){
      const sample=sampleHousekeepingCpu(arm==='linear'?originalStore():
        createScoWebAuthnMemoryStore(),1536);
      if(arm==='linear')linearUs.push(sample);
      else orderedUs.push(sample);
    }
  }
  /** @param {number[]} x */
  const median=x=>[...x].sort((a,b)=>a-b)[2];
  console.log('SCO_WA_MEMORY_EXPIRY_CPU '+JSON.stringify({
    workload:'1536 active challenges + 1536 active sessions, 5 alternating paired samples',
    units:'process user+system microseconds, isolated housekeeping only',
    baseline:linearUs,optimized:orderedUs,
    baselineMedianUs:median(linearUs),optimizedMedianUs:median(orderedUs),
    ratio:median(linearUs)/median(orderedUs)
  }));
  assert.equal(linearUs.length,5);
  assert.equal(orderedUs.length,5);
});
