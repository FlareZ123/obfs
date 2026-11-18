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
const {chooseRoot}=require('./sco-ratchet-bucket-shards');
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
    method:'POST',
    headers:{'content-type':'application/json',cookie:'session='+token},
    body:JSON.stringify({method:'batch',args:[seq,inputs]})
  });
  const parsed=/** @type {{value?:string[]}} */(await response.json());
  return {status:response.status,value:parsed.value};
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

/**
 * @param {string} base
 * @param {string} control
 * @returns {Promise<number>}
 */
async function admissions(base,control){
  const response=await fetch(base+'/__test__/admissions',{
    headers:{'x-test-control':control}
  });
  assert.equal(response.status,200);
  const body=/** @type {{recordedAAdmissions:number}} */(await response.json());
  return body.recordedAAdmissions;
}

/**
 * Test one original-versus-principal-first quota policy with the same root,
 * public RPC bytes, one trusted process and colliding A/B SQLite writer key.
 *
 * @param {Buffer} root
 * @param {boolean} nestedQuota
 * @returns {Promise<object>}
 */
async function sample(root,nestedQuota){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-bucket-quota-'));
  const db=path.join(dir,'buckets');
  fs.mkdirSync(db);
  const control=randomBytes(32).toString('hex');
  const tokenA=randomBytes(32).toString('hex');
  const tokenB=randomBytes(32).toString('hex');
  const bucket=bucketOf(root,'verified-A',8);
  assert.equal(bucketOf(root,'verified-B',8),bucket);
  /** @type {Worker|undefined} */
  let worker;
  try{
    worker=await launch(db,root,tokenA,tokenB,control,false,4,false,'',8,
      nestedQuota,1200);
    const sourceResponse=await fetch(worker.base+'/obfs/batch.mjs',{
      headers:{cookie:'session='+tokenA}
    });
    assert.equal(sourceResponse.status,200);
    const source=await sourceResponse.text();
    assert.equal(Buffer.byteLength(source),539);
    assert.equal(source.includes(root.toString('hex')),false);
    const sourceSha256=createHash('sha256').update(source).digest('hex');
    const aInputs=[challenge('A',0),challenge('A',1)];
    const bInputs=[challenge('B',0),challenge('B',1)];
    const expectedA=native(root,'verified-A',aInputs);
    const expectedB=native(root,'verified-B',bInputs);
    // Send sixteen same-A calls with identical inputs; the first call's
    // trusted async gate allows all sixteen to reserve pending admission.
    const firstSixteen=Array.from({length:16},()=>
      call(worker.base,tokenA,0,aInputs));
    let allAdmitted=false;
    for(let poll=0;poll<160;poll++){
      if((await admissions(worker.base,control))>=16){
        allAdmitted=true;
        break;
      }
      await sleep(5);
    }
    assert.equal(allAdmitted,true,'Failed to establish sixteen pending A admissions');
    const start=performance.now();
    const [seventeenth,b]=await Promise.all([
      call(worker.base,tokenA,0,aInputs),
      call(worker.base,tokenB,0,bInputs)
    ]);
    const bWallMs=performance.now()-start;
    assert.equal(seventeenth.status,429,
      'True 17th A call must be rejected while 16 same-principal A calls pending');
    assert.equal(b.status,nestedQuota?200:429,
      'B must be independent of A capacity in nested principal-quota case');
    if(nestedQuota)assert.deepEqual(b.value,expectedB);
    const completed=await Promise.all(firstSixteen);
    assert.deepEqual(completed.map(item=>item.status),
      Array.from({length:16},()=>200));
    for(const reply of completed)assert.deepEqual(reply.value,expectedA);
    const bRetry=await call(worker.base,tokenB,0,bInputs);
    assert.equal(bRetry.status,200);
    assert.deepEqual(bRetry.value,expectedB);
    assert.equal((await call(worker.base,'bad',0,aInputs)).status,403);
    const read=new TransactionalRatchet(path.join(db,'bucket-'+bucket+'.sqlite'),root);
    try{
      assert.deepEqual(read.snapshot('verified-A'),{seq:2,committed:2});
      assert.deepEqual(read.snapshot('verified-B'),{seq:2,committed:2});
    }finally{read.close();}
    return {
      platform:process.platform,node:process.version,
      isolation:nestedQuota?'per-verified-principal-quota-plus-bucket-writer':
        'combined-bucket-writer-and-principal-quota',
      bucket,sourceSha256,publicBytes:Buffer.byteLength(source),
      firstAAsyncAdmissionGateMs:1200,firstSixteenAStatuses:completed.map(x=>x.status),
      seventeenthAStatus:seventeenth.status,bBeforeRetryStatus:b.status,
      bAfterACompleteStatus:bRetry.status,
      sampledConcurrentAAndBResponseWallMs:Number(bWallMs.toFixed(3)),
      protectedAEvents:2,protectedBEvents:2,
      originalHmacParity:true
    };
  }finally{
    if(worker){
      try{await stop(worker,control);}catch{worker.child.kill();}
    }
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

/** @returns {Promise<object>} */
async function experiment(){
  const selected=chooseRoot(randomBytes(32),true);
  const old=await sample(selected.root,false);
  const repaired=await sample(selected.root,true);
  assert.equal(old.sourceSha256,repaired.sourceSha256);
  assert.equal(old.bucket,repaired.bucket);
  const report={
    platform:process.platform,node:process.version,
    chosenCollidingRootTries:selected.tries,
    samePrivateRoot:true,samePublicFacadeSha:old.sourceSha256,
    old,repaired,
    conclusion:'Bucket-level maxPendingPerPrincipal confounds distinct authenticated identities on a collision. Separating principal-capacity from writer-serialization admits B while still rejecting a true 17th pending A. This does not remove writer lock or CPU contention.'
  };
  process.stdout.write('SCO_RATCHET_BUCKET_QUOTA_IDENTITY '+JSON.stringify(report)+'\n');
  return report;
}

if(require.main===module){
  experiment().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={experiment,sample};
