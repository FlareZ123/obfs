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
const {bucketOf}=require('./sco-ratchet-bucket-keys');
const {launch,stop}=require('./sco-ratchet-transactional-http');

/** @typedef {Awaited<ReturnType<typeof launch>>} Worker */
/** @typedef {{status:number,value?:string[]}} Reply */

/** @param {string} label @param {number} index @returns {string} */
function challenge(label,index){
  return createHash('sha256').update(label+'/'+index).digest('hex');
}

/**
 * @param {string} base
 * @param {string} token
 * @param {number} seq
 * @param {string[]} inputs
 * @returns {Promise<Reply>}
 */
async function call(base,token,seq,inputs){
  const response=await fetch(base+'/obfs/rpc',{
    method:'POST',headers:{
      'content-type':'application/json',cookie:'session='+token
    },
    body:JSON.stringify({method:'batch',args:[seq,inputs]})
  });
  const body=/** @type {{value?:string[]}} */(await response.json());
  return {status:response.status,value:body.value};
}

/**
 * @param {Buffer} root
 * @param {string} principal
 * @param {string[]} inputs
 * @returns {string[]}
 */
function native(root,principal,inputs){
  const machine=createPrivateMachine(root);
  return inputs.map((value,index)=>{
    const result=machine.advance(principal,index,value);
    assert.equal(typeof result,'string');
    return /** @type {string} */(result);
  });
}

/** @typedef {'shared'|'bucket-different'|'bucket-same'|'per-account'} Layout */

/**
 * @param {Layout} layout
 * @param {Buffer} root
 * @returns {Promise<object>}
 */
async function httpSample(layout,root){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-bucket-http-'));
  const dbPath=path.join(dir,'trusted.sqlite');
  const isBucket=layout.startsWith('bucket-');
  const accountShards=layout==='per-account';
  if(isBucket||accountShards)fs.mkdirSync(dbPath);
  const bucketCount=isBucket?8:0;
  const aIndex=isBucket?bucketOf(root,'verified-A',bucketCount):null;
  const bIndex=isBucket?bucketOf(root,'verified-B',bucketCount):null;
  if(layout==='bucket-different')assert.notEqual(aIndex,bIndex);
  if(layout==='bucket-same')assert.equal(aIndex,bIndex);
  const tokenA=randomBytes(32).toString('hex');
  const tokenB=randomBytes(32).toString('hex');
  const control=randomBytes(32).toString('hex');
  /** @type {Worker[]} */
  const workers=[];
  try{
    const holder=await launch(dbPath,root,tokenA,tokenB,control,
      false,4,accountShards,'',bucketCount);
    workers.push(holder);
    const probe=await launch(dbPath,root,tokenA,tokenB,control,
      false,4,accountShards,'',bucketCount);
    workers.push(probe);
    /** @type {string[]} */
    const sourceHashes=[];
    for(const worker of workers){
      assert.equal((await fetch(worker.base+'/obfs/batch.mjs')).status,403);
      const response=await fetch(worker.base+'/obfs/batch.mjs',{
        headers:{cookie:'session='+tokenA}
      });
      assert.equal(response.status,200);
      const source=await response.text();
      assert.equal(Buffer.byteLength(source),539);
      assert.equal(source.includes(root.toString('hex')),false);
      sourceHashes.push(createHash('sha256').update(source).digest('hex'));
    }
    assert.equal(sourceHashes[0],sourceHashes[1]);
    assert.equal((await call(probe.base,'invalid',0,[challenge('bad',0)])).status,403);
    const inputs=[challenge('B-held',0),challenge('B-held',1)];
    const expected=native(root,'verified-B',inputs);
    const hold=await fetch(holder.base+'/__test__/hold',{
      method:'POST',headers:{'x-test-control':control}
    });
    assert.equal(hold.status,200);
    assert.equal(await hold.text(),'HELD');
    const started=performance.now();
    const b=await call(probe.base,tokenB,0,inputs);
    const bLatencyMs=performance.now()-started;
    assert.equal(b.status,200);
    assert.deepEqual(b.value,expected);
    const shouldBlock=layout==='shared'||layout==='bucket-same';
    assert.ok(shouldBlock?bLatencyMs>800:bLatencyMs<500,
      'Bucket outcome does not match predicted same-file writer-lock behavior');
    await sleep(Math.max(0,1650-bLatencyMs));
    const aFirst=[challenge('A-first',0),challenge('A-first',1)];
    const aExpected=native(root,'verified-A',aFirst);
    const same=await Promise.all([
      call(holder.base,tokenA,0,aFirst),
      call(probe.base,tokenA,0,aFirst)
    ]);
    assert.deepEqual(same.map(x=>x.status),[200,200]);
    for(const row of same)assert.deepEqual(row.value,aExpected);
    const alternatives=[
      [challenge('A-left',2),challenge('A-left',3)],
      [challenge('A-right',2),challenge('A-right',3)]
    ];
    const conflict=await Promise.all([
      call(holder.base,tokenA,2,alternatives[0]),
      call(probe.base,tokenA,2,alternatives[1])
    ]);
    assert.deepEqual(conflict.map(x=>x.status).sort((x,y)=>x-y),[200,403]);
    const winner=conflict[0].status===200?0:1;
    const expectedNext=native(root,'verified-A',
      [...aFirst,...alternatives[winner]]).slice(2);
    assert.deepEqual(conflict[winner].value,expectedNext);
    const lastRetry=await call(probe.base,tokenA,2,alternatives[winner]);
    assert.equal(lastRetry.status,200);
    assert.deepEqual(lastRetry.value,expectedNext);
    assert.equal((await call(holder.base,tokenA,2,alternatives[1-winner])).status,403);
    assert.equal((await call(holder.base,tokenA,0,aFirst)).status,403);
    await Promise.all(workers.map(worker=>stop(worker,control)));
    workers.length=0;
    const restarted=await launch(dbPath,root,tokenA,tokenB,control,
      false,4,accountShards,'',bucketCount);
    workers.push(restarted);
    assert.equal((await call(restarted.base,tokenA,2,alternatives[winner])).status,200);
    assert.equal((await call(restarted.base,tokenA,0,aFirst)).status,403);
    assert.equal((await call(restarted.base,tokenB,0,inputs)).status,200);
    const fileBase=isBucket||accountShards?dbPath:dir;
    const dbFiles=fs.readdirSync(fileBase).filter(name=>name.endsWith('.sqlite'));
    assert.equal(dbFiles.length,bucketCount|| (accountShards?2:1));
    const dbBytes=dbFiles.reduce((sum,file)=>sum+
      fs.statSync(path.join(fileBase,file)).size,0);
    return {
      layout,platform:process.platform,node:process.version,
      bucketCount,aIndex,bIndex,sourceSha256:sourceHashes[0],
      heldWriterMs:1500,measuredBWallMs:Number(bLatencyMs.toFixed(3)),
      expectedBlocked:shouldBlock,observedBlocked:bLatencyMs>800,
      exactReplayStatuses:same.map(x=>x.status),
      conflictingReplayStatuses:conflict.map(x=>x.status),
      lastCrossProcessRetry:lastRetry.status,restartCached:true,
      unauthorizedRpcStatus:403,committedA:4,committedB:2,
      allOriginalOutputsMatch:true,dbFiles:dbFiles.length,dbBytes
    };
  }finally{
    for(const worker of workers){
      try{await stop(worker,control);}catch{worker.child.kill();}
    }
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

/**
 * @param {Buffer} root
 * @param {boolean} sameBucket
 * @returns {{root:Buffer,tries:number,a:number,b:number}}
 */
function chooseRoot(root,sameBucket){
  let current=root;
  for(let attempt=1;attempt<=1000;attempt++){
    const a=bucketOf(current,'verified-A',8);
    const b=bucketOf(current,'verified-B',8);
    if((a===b)===sameBucket)return {root:current,tries:attempt,a,b};
    current=randomBytes(32);
  }
  throw new TypeError('Failed to select a bounded deterministic collision fixture');
}

/**
 * @param {Buffer} root
 * @returns {object}
 */
function footprint(root){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-bucket-space-'));
  const principals=Array.from({length:64},(_,i)=>'verified-account-'+i);
  const inputs=principals.map((principal,i)=>challenge(principal,i));
  const assignments=principals.map(p=>bucketOf(root,p,8));
  /** @type {number[]} */
  const occupancies=Array.from({length:8},(_,i)=>assignments.filter(x=>x===i).length);
  const collisionPairs=occupancies.reduce((sum,n)=>sum+n*(n-1)/2,0);
  /** @type {Record<string,{files:number,bytes:number}>} */
  const footprintByLayout={};
  try{
    for(const layout of ['shared','bucket','per-account']){
      const base=path.join(dir,layout);
      fs.mkdirSync(base);
      /** @type {Map<string,TransactionalRatchet>} */
      const stores=new Map();
      try{
        const file=/** @param {string} principal */(principal)=>{
          if(layout==='shared')return 'shared.sqlite';
          if(layout==='bucket')return 'bucket-'+bucketOf(root,principal,8)+'.sqlite';
          return 'principal-'+createHash('sha256').update(principal).digest('hex')+'.sqlite';
        };
        // Preinitialize full fixed-bucket set independently of occupancy.
        if(layout==='bucket'){
          for(let index=0;index<8;index++){
            const key='bucket-'+index+'.sqlite';
            stores.set(key,new TransactionalRatchet(path.join(base,key),root));
          }
        }
        const original=createPrivateMachine(root);
        for(const [index,principal] of principals.entries()){
          const key=file(principal);
          let store=stores.get(key);
          if(!store){
            store=new TransactionalRatchet(path.join(base,key),root);
            stores.set(key,store);
          }
          const observed=store.batch(principal,0,[inputs[index]]);
          const expected=original.advance(principal,0,inputs[index]);
          assert.equal(observed.kind,'fresh');
          assert.deepEqual(observed.outputs,[expected]);
          assert.deepEqual(store.snapshot(principal),{seq:1,committed:1});
        }
      }finally{
        for(const store of stores.values())store.close();
      }
      const fileNames=fs.readdirSync(base).filter(n=>n.endsWith('.sqlite'));
      footprintByLayout[layout]={
        files:fileNames.length,
        bytes:fileNames.reduce((sum,name)=>sum+
          fs.statSync(path.join(base,name)).size,0)
      };
    }
    assert.equal(footprintByLayout.shared.files,1);
    assert.equal(footprintByLayout.bucket.files,8);
    assert.equal(footprintByLayout['per-account'].files,64);
    return {
      verifiedPrincipals:principals.length,bucketCount:8,
      occupancies,collisionPairs,
      collisionPairsExpectedUnderIndependentUniformHash:64*63/16,
      filesAndBytes:footprintByLayout,allOriginalOutputsMatch:true
    };
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

/** @returns {Promise<object>} */
async function experiment(){
  assert.throws(()=>bucketOf(Buffer.alloc(32),'verified-A',3),/power of two/u);
  assert.throws(()=>bucketOf(Buffer.alloc(31),'verified-A',8),/256-bit/u);
  assert.throws(()=>bucketOf(Buffer.alloc(32),'',8),/verified principal/u);
  const root=randomBytes(32);
  const separate=chooseRoot(root,false);
  const collided=chooseRoot(root,true);
  const shared=await httpSample('shared',separate.root);
  const bucketSeparate=await httpSample('bucket-different',separate.root);
  const bucketCollision=await httpSample('bucket-same',collided.root);
  const perAccount=await httpSample('per-account',separate.root);
  assert.equal(shared.sourceSha256,bucketSeparate.sourceSha256);
  assert.equal(shared.sourceSha256,bucketCollision.sourceSha256);
  assert.equal(shared.sourceSha256,perAccount.sourceSha256);
  const space=footprint(randomBytes(32));
  const report={
    platform:process.platform,node:process.version,
    rootSelection:{differentTries:separate.tries,sameTries:collided.tries},
    shared,bucketSeparate,bucketCollision,perAccount,space,
    conclusion:'Eight precreated root-keyed database buckets bound file count and avoid per-principal cold SQLite admission. They isolate unrelated A/B writers only for different-bucket verified principals; collision and synchronous CPU bottlenecks remain.'
  };
  process.stdout.write('SCO_RATCHET_BUCKET_SHARDS '+JSON.stringify(report)+'\n');
  return report;
}

if(require.main===module){
  experiment().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={experiment,footprint,chooseRoot};
