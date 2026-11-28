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
  /** @type {Map<string,number>} */
  const versions=new Map();
  /** @type {string|null} */
  let policy=null;
  /** @param {number} time */
  function purge(time){
    for(const [id,row] of challenges)if(row.expiresAt<=time)challenges.delete(id);
    for(const [id,row] of sessions)if(row.expiresAt<=time)sessions.delete(id);
  }
  /** @param {string} principal */
  /** @param {string} principal @returns {number} */
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
 * Isolated housekeeping receipt. Node process.cpuUsage can report zero for
 * short Windows operations due coarse host scheduling resolution; pair it
 * with high-resolution monotonic elapsed time rather than invent a CPU ratio.
 * This excludes ES256, HTTP and protected application work. Not a 2.5x proof.
 * @param {ScoWebAuthnStateStore} store
 * @param {number} capacity
 * @returns {{cpuUs:number,wallUs:number}}
 */
function sampleHousekeeping(store,capacity){
  store.assertConfiguration('c'.repeat(64));
  const now=1_900_000_000_000;
  const challenge=Buffer.alloc(32,0x42);
  let admitted=0;
  const beforeCpu=process.cpuUsage();
  const beforeWall=process.hrtime.bigint();
  for(let i=0;i<capacity;i++){
    store.insertChallenge('nonce-'+i,'account','login',challenge,now+120_000,
      now,capacity);
    if(store.mintSession('token-'+i,'account',now+120_000,0,now,capacity)===true)
      admitted++;
  }
  const elapsedWall=Number(process.hrtime.bigint()-beforeWall)/1000;
  const elapsedCpu=process.cpuUsage(beforeCpu);
  assert.equal(admitted,capacity,'Both arms must perform the same positive work');
  return {cpuUs:elapsedCpu.user+elapsedCpu.system,wallUs:elapsedWall};
}

test('paired CPU and monotonic wall receipt: 1536-row memory-store housekeeping',()=>{
  /** @type {Array<{cpuUs:number,wallUs:number}>} */
  const linear=[];
  /** @type {Array<{cpuUs:number,wallUs:number}>} */
  const ordered=[];
  for(let i=0;i<5;i++){
    // AB/BA alternating order and separate fresh stores for every sample.
    const arms=i%2===0?['linear','ordered']:['ordered','linear'];
    for(const arm of arms){
      const sample=sampleHousekeeping(arm==='linear'?originalStore():
        createScoWebAuthnMemoryStore(),1536);
      if(arm==='linear')linear.push(sample);
      else ordered.push(sample);
    }
  }
  /** @param {number[]} x */
  const median=x=>[...x].sort((a,b)=>a-b)[2];
  /** @param {Array<{cpuUs:number,wallUs:number}>} x @param {'cpuUs'|'wallUs'} field */
  const samples=(x,field)=>x.map(row=>row[field]);
  const baselineCpuMedian=median(samples(linear,'cpuUs'));
  const orderedCpuMedian=median(samples(ordered,'cpuUs'));
  const baselineWallMedian=median(samples(linear,'wallUs'));
  const orderedWallMedian=median(samples(ordered,'wallUs'));
  console.log('SCO_WA_MEMORY_EXPIRY_CPU '+JSON.stringify({
    workload:'1536 active challenges and 1536 active sessions, 5 alternating paired samples',
    units:'CPU user+system microseconds, high-resolution wall microseconds',
    baseline:linear,optimized:ordered,
    baselineCpuMedianUs:baselineCpuMedian,optimizedCpuMedianUs:orderedCpuMedian,
    cpuRatio:orderedCpuMedian>0?baselineCpuMedian/orderedCpuMedian:null,
    baselineWallMedianUs:baselineWallMedian,optimizedWallMedianUs:orderedWallMedian,
    wallRatio:orderedWallMedian>0?baselineWallMedian/orderedWallMedian:null,
    note:'CPU ratio null denotes insufficient CPU timer resolution, not infinite speedup'
  }));
  assert.equal(linear.length,5);
  assert.equal(ordered.length,5);
});

/**
 * Check the opposite occupancy regime: one challenge and one session at a
 * time, with no challenge retention. The fast path must not incur a large
 * startup/sparse-regime penalty while solving the full-capacity quadratic scan.
 * @param {ScoWebAuthnStateStore} store
 * @param {number} iterations
 * @returns {{cpuUs:number,wallUs:number}}
 */
function sampleSparseHousekeeping(store,iterations){
  store.assertConfiguration('f'.repeat(64));
  const now=1_900_000_000_000;
  const challenge=Buffer.alloc(32,0x32);
  let completed=0;
  const c0=process.cpuUsage();
  const w0=process.hrtime.bigint();
  for(let i=0;i<iterations;i++){
    const id='nonce-'+i,token='token-'+i;
    store.insertChallenge(id,'account','login',challenge,now+120_000,now,1);
    const row=store.consumeChallenge(id);
    if(!row)throw new Error('Expected just-issued challenge');
    if(!store.mintSession(token,'account',now+120_000,0,now,1))
      throw new Error('Expected granted local session');
    if(!store.revokeSession(token))throw new Error('Expected local revocation');
    completed++;
  }
  const wallUs=Number(process.hrtime.bigint()-w0)/1000;
  const elapsed=process.cpuUsage(c0);
  assert.equal(completed,iterations);
  return {cpuUs:elapsed.user+elapsed.system,wallUs};
}

test('paired sparse-regime control: single-live-record expiry guard overhead',()=>{
  /** @type {Array<{cpuUs:number,wallUs:number}>} */
  const control=[];
  /** @type {Array<{cpuUs:number,wallUs:number}>} */
  const candidate=[];
  for(let i=0;i<5;i++){
    for(const arm of (i%2?['candidate','control']:['control','candidate'])){
      const observation=sampleSparseHousekeeping(arm==='control'?originalStore():
        createScoWebAuthnMemoryStore(),12_000);
      if(arm==='control')control.push(observation);
      else candidate.push(observation);
    }
  }
  /** @param {number[]} xs */
  const median5=xs=>[...xs].sort((a,b)=>a-b)[2];
  /** @param {Array<{cpuUs:number,wallUs:number}>} xs @param {'cpuUs'|'wallUs'} field */
  const get=(xs,field)=>xs.map(x=>x[field]);
  const cCpu=median5(get(control,'cpuUs')),oCpu=median5(get(candidate,'cpuUs'));
  const cWall=median5(get(control,'wallUs')),oWall=median5(get(candidate,'wallUs'));
  console.log('SCO_WA_MEMORY_SPARSE_CPU '+JSON.stringify({
    workload:'12000 cycles of insert/consume/mint/revoke with at most one row per map',
    baseline:control,optimized:candidate,
    candidateCpuOverBaseline:cCpu>0?oCpu/cCpu:null,
    candidateWallOverBaseline:cWall>0?oWall/cWall:null,
    note:'isolated state methods, excludes WebAuthn signing and HTTP'
  }));
  assert.equal(control.length,5);
  assert.equal(candidate.length,5);
});
