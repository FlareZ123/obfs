'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomBytes,createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {setTimeout:sleep}=require('node:timers/promises');
const {TransactionalRatchet}=require('./sco-ratchet-transactional-store');
const {createPrivateMachine}=require('./sco-ratchet-boundary');
const {launch,stop}=require('./sco-ratchet-transactional-http');

/** @typedef {Awaited<ReturnType<typeof launch>>} Worker */
/** @typedef {{status:number,value?:string[]}} Reply */

/** @param {string} label @param {number} index @returns {string} */
function challenge(label,index){
  return createHash('sha256').update(label+'/'+index).digest('hex');
}

/**
 * @param {string} databasePath
 * @param {boolean} accountShards
 * @param {string} principal
 * @returns {string}
 */
function principalFile(databasePath,accountShards,principal){
  return accountShards?path.join(databasePath,'principal-'+
    createHash('sha256').update(principal).digest('hex')+'.sqlite'):databasePath;
}

/**
 * @param {string} base
 * @param {string|undefined} token
 * @param {number} seq
 * @param {string[]} inputs
 * @param {unknown[]} [override]
 * @returns {Promise<Reply>}
 */
async function call(base,token,seq,inputs,override){
  const response=await fetch(base+'/obfs/rpc',{
    method:'POST',
    headers:{'content-type':'application/json',...(token?{cookie:'session='+token}:{})},
    body:JSON.stringify({method:'batch',args:override??[seq,inputs]})
  });
  const value=/** @type {{value?:string[]}} */(await response.json());
  return {status:response.status,value:value.value};
}

/**
 * @param {Buffer} root
 * @param {string} principal
 * @param {number} start
 * @param {string[]} inputs
 * @returns {string[]}
 */
function native(root,principal,start,inputs){
  const machine=createPrivateMachine(root);
  /** @type {string[]} */
  const results=[];
  // Advance all prior events when comparing an independently reconstructed
  // state; the caller normally passes the full prefix via nativeSequence.
  assert.equal(start,0);
  for(const [index,input] of inputs.entries()){
    const output=machine.advance(principal,index,input);
    assert.equal(typeof output,'string');
    results.push(/** @type {string} */(output));
  }
  return results;
}

/**
 * @param {boolean} accountShards
 * @returns {Promise<object>}
 */
async function sample(accountShards){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-account-shards-'));
  const databasePath=path.join(dir,'trusted.sqlite');
  const root=randomBytes(32);
  const tokenA=randomBytes(32).toString('hex');
  const tokenB=randomBytes(32).toString('hex');
  const control=randomBytes(32).toString('hex');
  /** @type {Worker[]} */
  const workers=[];
  /** @param {string} principal @returns {{seq:number,committed:number}} */
  function snapshot(principal){
    const store=new TransactionalRatchet(
      principalFile(databasePath,accountShards,principal),root);
    try{return store.snapshot(principal);}finally{store.close();}
  }
  try{
    if(accountShards)fs.mkdirSync(databasePath);
    // Avoid unrelated cold WAL initialization races during the lock test.
    for(const principal of (accountShards?['verified-A','verified-B']:['verified-A'])){
      const store=new TransactionalRatchet(
        principalFile(databasePath,accountShards,principal),root);
      store.close();
    }
    const holder=await launch(databasePath,root,tokenA,tokenB,control,false,4,accountShards);
    const probe=await launch(databasePath,root,tokenA,tokenB,control,false,4,accountShards);
    workers.push(holder,probe);
    /** @type {{sha:string,bytes:number}[]} */
    const sources=[];
    for(const worker of workers){
      assert.equal((await fetch(worker.base+'/obfs/batch.mjs')).status,403);
      const response=await fetch(worker.base+'/obfs/batch.mjs',{
        headers:{cookie:'session='+tokenA}
      });
      assert.equal(response.status,200);
      const text=await response.text();
      assert.doesNotMatch(text,/ratchet-step-v1|createHmac|createPrivateMachine/u);
      assert.equal(text.includes(root.toString('hex')),false);
      sources.push({sha:createHash('sha256').update(text).digest('hex'),
        bytes:Buffer.byteLength(text)});
    }
    assert.deepEqual(sources[0],sources[1]);
    const firstBatches=Array.from({length:3},(_,trial)=>
      [challenge('B-'+trial,0),challenge('B-'+trial,1)]);
    const bExpected=native(root,'verified-B',0,firstBatches.flat());
    /** @type {{trial:number,bWallMs:number,nativeWallMs:number,latencyRatio:number}[]} */
    const timings=[];
    for(let trial=0;trial<firstBatches.length;trial++){
      const expected=bExpected.slice(trial*2,trial*2+2);
      const nativeStart=performance.now();
      const nativeBatch=native(root,'verified-B',0,
        firstBatches.slice(0,trial+1).flat()).slice(trial*2);
      const nativeWallMs=performance.now()-nativeStart;
      assert.deepEqual(nativeBatch,expected);
      const held=await fetch(holder.base+'/__test__/hold',{
        method:'POST',headers:{'x-test-control':control}
      });
      assert.equal(held.status,200);
      assert.equal(await held.text(),'HELD');
      const started=performance.now();
      const b=await call(probe.base,tokenB,trial*2,firstBatches[trial]);
      const bWallMs=performance.now()-started;
      assert.equal(b.status,200);
      assert.deepEqual(b.value,expected);
      if(accountShards)assert.ok(bWallMs<500,
        'Independent B storage should bypass the A-only writer hold');
      else assert.ok(bWallMs>800,
        'Shared single-file control did not demonstrate A-to-B blocking');
      timings.push({trial,bWallMs:Number(bWallMs.toFixed(3)),
        nativeWallMs:Number(nativeWallMs.toFixed(3)),
        latencyRatio:Number((bWallMs/nativeWallMs).toFixed(5))});
      // A's 1500ms test hold is timer-controlled by the trusted holder.
      await sleep(Math.max(0,1650-bWallMs));
    }
    assert.deepEqual(snapshot('verified-B'),{seq:6,committed:6});
    assert.equal((await call(probe.base,undefined,0,firstBatches[0])).status,403);
    const aFirst=[challenge('A-0',0),challenge('A-0',1)];
    const aChoices=[
      [challenge('A-left',2),challenge('A-left',3)],
      [challenge('A-right',2),challenge('A-right',3)]
    ];
    const same=await Promise.all([
      call(holder.base,tokenA,0,aFirst),
      call(probe.base,tokenA,0,aFirst)
    ]);
    assert.deepEqual(same.map(x=>x.status),[200,200]);
    const expectedFirst=native(root,'verified-A',0,aFirst);
    for(const reply of same)assert.deepEqual(reply.value,expectedFirst);
    assert.deepEqual(snapshot('verified-A'),{seq:2,committed:2});
    const different=await Promise.all([
      call(holder.base,tokenA,2,aChoices[0]),
      call(probe.base,tokenA,2,aChoices[1])
    ]);
    assert.deepEqual(different.map(x=>x.status).sort((a,b)=>a-b),[200,403]);
    const winner=different[0].status===200?0:1;
    const expectedNext=native(root,'verified-A',0,
      [...aFirst,...aChoices[winner]]).slice(2);
    assert.deepEqual(different[winner].value,expectedNext);
    assert.deepEqual(snapshot('verified-A'),{seq:4,committed:4});
    const retry=await call((winner===0?probe:holder).base,
      tokenA,2,aChoices[winner]);
    assert.equal(retry.status,200);
    assert.deepEqual(retry.value,expectedNext);
    assert.equal((await call(probe.base,tokenA,2,aChoices[1-winner])).status,403);
    assert.equal((await call(holder.base,tokenA,0,aFirst)).status,403);
    assert.equal((await call(holder.base,tokenA,4,aFirst,
      [4,aFirst,'verified-B'])).status,403);
    await Promise.all(workers.map(worker=>stop(worker,control)));
    workers.length=0;
    const restarted=await launch(databasePath,root,tokenA,tokenB,control,false,4,accountShards);
    workers.push(restarted);
    const recent=await call(restarted.base,tokenA,2,aChoices[winner]);
    const bLast=await call(restarted.base,tokenB,4,firstBatches[2]);
    assert.equal(recent.status,200);
    assert.deepEqual(recent.value,expectedNext);
    assert.equal(bLast.status,200);
    assert.deepEqual(bLast.value,bExpected.slice(4));
    assert.equal((await call(restarted.base,tokenA,0,aFirst)).status,403);
    assert.deepEqual(snapshot('verified-A'),{seq:4,committed:4});
    assert.deepEqual(snapshot('verified-B'),{seq:6,committed:6});
    return {
      architecture:accountShards?'verified-principal-sharded-SQLite':'single-global-SQLite-writer',
      node:process.version,platform:process.platform,
      source:sources[0],sameAccountStatuses:same.map(x=>x.status),
      conflictingStatuses:different.map(x=>x.status),
      committedAEvents:4,committedBEvents:6,
      crossProcessRetry:retry.status,restartedRetry:recent.status,
      anonymousStatus:403,authenticationBoundary:'server-verified cookie only',
      holderDurationMs:1500,measuredB:timings
    };
  }finally{
    for(const worker of workers){
      try{await stop(worker,control);}catch{worker.child.kill();}
    }
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

/** @returns {Promise<object>} */
async function experiment(){
  const shared=await sample(false);
  const sharded=await sample(true);
  assert.deepEqual(
    /** @type {{source:{sha:string,bytes:number}}} */(shared).source,
    /** @type {{source:{sha:string,bytes:number}}} */(sharded).source);
  const a=/** @type {{measuredB:{bWallMs:number}[]}} */(shared).measuredB.map(x=>x.bWallMs);
  const b=/** @type {{measuredB:{bWallMs:number}[]}} */(sharded).measuredB.map(x=>x.bWallMs);
  const median=/** @param {number[]} values */(values)=>[...values].sort((x,y)=>x-y)[1];
  const report={
    shared,sharded,sharedMedianBMs:median(a),shardedMedianBMs:median(b),
    sharedOverShardedMedianRatio:Number((median(a)/median(b)).toFixed(5)),
    boundary:'Original 8MiB/event private work, identical SCO facade, local two-process test. B service latency is not obfuscated CPU cost. Full attacker relay, multi-account saturation, browser/WAN, crash recovery, startup race and hostile filesystem remain unproved.'
  };
  process.stdout.write('SCO_RATCHET_ACCOUNT_SHARDS '+JSON.stringify(report)+'\n');
  return report;
}

if(require.main===module){
  experiment().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={experiment,sample};
