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

/** @param {string} label @param {number} index @returns {string} */
function challenge(label,index){
  return createHash('sha256').update(label+'/'+index).digest('hex');
}

/**
 * @param {string} databasePath
 * @param {boolean} sharded
 * @param {string} principal
 * @returns {string}
 */
function fileFor(databasePath,sharded,principal){
  return sharded?path.join(databasePath,'principal-'+
    createHash('sha256').update(principal).digest('hex')+'.sqlite'):databasePath;
}

/**
 * @param {string} base
 * @param {string} token
 * @param {number} start
 * @param {string[]} inputs
 * @returns {Promise<{status:number,value?:string[]}>}
 */
async function call(base,token,start,inputs){
  const response=await fetch(base+'/obfs/rpc',{
    method:'POST',
    headers:{'content-type':'application/json',cookie:'session='+token},
    body:JSON.stringify({method:'batch',args:[start,inputs]})
  });
  const body=/** @type {{value?:string[]}} */(await response.json());
  return {status:response.status,value:body.value};
}

/**
 * @param {ReturnType<typeof createPrivateMachine>} machine
 * @param {string} principal
 * @param {number} start
 * @param {string[]} inputs
 * @returns {string[]}
 */
function original(machine,principal,start,inputs){
  return inputs.map((value,index)=>{
    const output=machine.advance(principal,start+index,value);
    assert.equal(typeof output,'string');
    return /** @type {string} */(output);
  });
}

/**
 * @param {boolean} sharded
 * @returns {Promise<object>}
 */
async function sample(sharded){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-eventloop-'));
  const db=path.join(dir,'trusted.sqlite');
  const marker=path.join(dir,'a-entered-private-work.txt');
  const root=randomBytes(32);
  const tokenA=randomBytes(32).toString('hex');
  const tokenB=randomBytes(32).toString('hex');
  const control=randomBytes(32).toString('hex');
  /** @type {Worker|undefined} */
  let worker;
  try{
    if(sharded)fs.mkdirSync(db);
    for(const principal of (sharded?['verified-A','verified-B']:['verified-A'])){
      const store=new TransactionalRatchet(fileFor(db,sharded,principal),root);
      store.close();
    }
    worker=await launch(db,root,tokenA,tokenB,control,false,4,sharded,marker);
    const authorized=await fetch(worker.base+'/obfs/batch.mjs',{
      headers:{cookie:'session='+tokenA}
    });
    assert.equal(authorized.status,200);
    const source=await authorized.text();
    const sourceSha=createHash('sha256').update(source).digest('hex');
    assert.equal(source.includes(root.toString('hex')),false);
    const machineA=createPrivateMachine(root);
    const machineB=createPrivateMachine(root);
    /** @type {{trial:number,quietWallMs:number,loadedWallMs:number,
      nativeLoadedWallMs:number,loadedToQuietRatio:number,loadedToNativeRatio:number,
      submitBeforeAComplete:boolean}[]} */
    const rows=[];
    for(let trial=0;trial<3;trial++){
      const aStart=trial*64;
      const aInputs=Array.from({length:64},(_,index)=>challenge('A-'+trial,index));
      const aExpected=original(machineA,'verified-A',aStart,aInputs);
      const quietStart=trial*4;
      const quietInputs=[challenge('B-quiet-'+trial,0),
        challenge('B-quiet-'+trial,1)];
      const quietExpected=original(machineB,'verified-B',quietStart,quietInputs);
      const loadedStart=quietStart+2;
      const loadedInputs=[challenge('B-loaded-'+trial,0),
        challenge('B-loaded-'+trial,1)];
      const nativeStart=performance.now();
      const loadedExpected=original(machineB,'verified-B',loadedStart,loadedInputs);
      const nativeLoadedWallMs=performance.now()-nativeStart;
      const quietStarted=performance.now();
      const quiet=await call(worker.base,tokenB,quietStart,quietInputs);
      const quietWallMs=performance.now()-quietStarted;
      assert.equal(quiet.status,200);
      assert.deepEqual(quiet.value,quietExpected);

      fs.rmSync(marker,{force:true});
      let aCompletedAt=Infinity;
      const aPromise=call(worker.base,tokenA,aStart,aInputs).then(reply=>{
        aCompletedAt=performance.now();
        return reply;
      });
      // The child writes and atomically renames the marker immediately before
      // entering the original private 64-event HMAC, not at HTTP admission.
      let markerObserved=false;
      for(let poll=0;poll<2500;poll++){
        if(fs.existsSync(marker)){markerObserved=true;break;}
        if(aCompletedAt!==Infinity)break;
        await sleep(2);
      }
      assert.equal(markerObserved,true,'A private-work marker not observed');
      const bSubmittedAt=performance.now();
      assert.ok(bSubmittedAt<aCompletedAt,
        'B must be submitted while A protected work is outstanding');
      const loaded=await call(worker.base,tokenB,loadedStart,loadedInputs);
      const loadedWallMs=performance.now()-bSubmittedAt;
      const a=await aPromise;
      assert.equal(a.status,200);
      assert.deepEqual(a.value,aExpected);
      assert.equal(loaded.status,200);
      assert.deepEqual(loaded.value,loadedExpected);
      assert.ok(bSubmittedAt<aCompletedAt,
        'A had completed before B submission');
      rows.push({
        trial,quietWallMs:Number(quietWallMs.toFixed(3)),
        loadedWallMs:Number(loadedWallMs.toFixed(3)),
        nativeLoadedWallMs:Number(nativeLoadedWallMs.toFixed(3)),
        loadedToQuietRatio:Number((loadedWallMs/quietWallMs).toFixed(5)),
        loadedToNativeRatio:Number((loadedWallMs/nativeLoadedWallMs).toFixed(5)),
        submitBeforeAComplete:true
      });
    }
    for(const [principal,expected] of [
      /** @type {[string,number]} */(['verified-A',192]),
      /** @type {[string,number]} */(['verified-B',12])
    ]){
      const store=new TransactionalRatchet(fileFor(db,sharded,principal),root);
      try{assert.deepEqual(store.snapshot(principal),{
        seq:expected,committed:expected});}finally{store.close();}
    }
    return {
      layout:sharded?'principal-shards':'one-global-writer',
      node:process.version,platform:process.platform,
      facadeBytes:Buffer.byteLength(source),facadeSha256:sourceSha,
      aEvents:192,bEvents:12,rows,
      markerProof:'Trusted A marker observed and B submitted before A HTTP completion',
      boundary:'Single trusted synchronous Node event loop; B service latency under A CPU is not B CPU cost or proof of obfuscation defense.'
    };
  }finally{
    if(worker){
      try{await stop(worker,control);}catch{worker.child.kill();}
    }
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

/** @param {number[]} nums @returns {number} */
function median(nums){
  const sorted=[...nums].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @returns {Promise<object>} */
async function experiment(){
  const shared=await sample(false);
  const sharded=await sample(true);
  const get=/** @param {object} source */(source)=>
    /** @type {{rows:{loadedWallMs:number,quietWallMs:number,loadedToNativeRatio:number}[],
      facadeSha256:string}} */(source);
  const a=get(shared),b=get(sharded);
  assert.equal(a.facadeSha256,b.facadeSha256);
  const report={
    shared,sharded,
    medians:{
      sharedLoadedBMs:median(a.rows.map(x=>x.loadedWallMs)),
      shardedLoadedBMs:median(b.rows.map(x=>x.loadedWallMs)),
      sharedQuietBMs:median(a.rows.map(x=>x.quietWallMs)),
      shardedQuietBMs:median(b.rows.map(x=>x.quietWallMs))
    },
    strictLoadedBWallAbove2_5xNative:{
      shared:a.rows.filter(x=>x.loadedToNativeRatio>2.5).length,
      sharded:b.rows.filter(x=>x.loadedToNativeRatio>2.5).length
    },
    conclusion:'Independent account SQLite files cannot schedule unrelated B callbacks during synchronous A HMAC on the same Node event loop; matching conventional single-thread servers share this limit.'
  };
  process.stdout.write('SCO_RATCHET_SHARDS_EVENTLOOP '+JSON.stringify(report)+'\n');
  return report;
}

if(require.main===module){
  experiment().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={experiment,sample};
