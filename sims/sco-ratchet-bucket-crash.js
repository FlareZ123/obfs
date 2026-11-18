'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomBytes,createHash}=require('node:crypto');
const {TransactionalRatchet}=require('./sco-ratchet-transactional-store');
const {createPrivateMachine}=require('./sco-ratchet-boundary');
const {bucketOf}=require('./sco-ratchet-bucket-keys');
const {terminateAtBarrier}=require('./sco-ratchet-transactional-crash');

/** @param {string} label @param {number} seq @returns {string} */
function challenge(label,seq){
  return createHash('sha256').update(label+'/'+seq).digest('hex');
}

/**
 * @param {Buffer} root
 * @param {string} principal
 * @param {string[]} inputs
 * @returns {string[]}
 */
function original(root,principal,inputs){
  const machine=createPrivateMachine(root);
  return inputs.map((value,index)=>{
    const output=machine.advance(principal,index,value);
    assert.equal(typeof output,'string');
    return /** @type {string} */(output);
  });
}

/**
 * @returns {{root:Buffer,tries:number,preIndex:number,postIndex:number,bIndex:number}}
 */
function selectRoot(){
  for(let tries=1;tries<=1000;tries++){
    const root=randomBytes(32);
    const preIndex=bucketOf(root,'verified-before-commit',8);
    const postIndex=bucketOf(root,'verified-after-commit',8);
    const bIndex=bucketOf(root,'verified-B',8);
    if(preIndex===postIndex&&preIndex!==bIndex)
      return {root,tries,preIndex,postIndex,bIndex};
  }
  throw new TypeError('No fixed conditional bucket-collision fixture in 1000 roots');
}

/** @returns {Promise<object>} */
async function experiment(){
  const selection=selectRoot();
  const {root,preIndex,postIndex,bIndex}=selection;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-bucket-crash-'));
  const prePrincipal='verified-before-commit';
  const postPrincipal='verified-after-commit';
  const bPrincipal='verified-B';
  const preInputs=[challenge('pre',0),challenge('pre',1)];
  const postInputs=[challenge('post',0),challenge('post',1)];
  const bInputs=[challenge('B',0),challenge('B',1)];
  const preExpected=original(root,prePrincipal,preInputs);
  const postExpected=original(root,postPrincipal,postInputs);
  const bExpected=original(root,bPrincipal,bInputs);
  /** @param {string} principal @returns {string} */
  function fileOf(principal){
    return path.join(dir,'bucket-'+bucketOf(root,principal,8)+'.sqlite');
  }
  /** @param {string} principal @param {(store:TransactionalRatchet)=>unknown} callback @returns {unknown} */
  function withStore(principal,callback){
    const store=new TransactionalRatchet(fileOf(principal),root);
    try{return callback(store);}finally{store.close();}
  }
  try{
    for(let index=0;index<8;index++){
      const store=new TransactionalRatchet(path.join(dir,'bucket-'+index+'.sqlite'),root);
      store.close();
    }
    const bInitial=/** @type {ReturnType<TransactionalRatchet['batch']>} */(
      withStore(bPrincipal,store=>store.batch(bPrincipal,0,bInputs)));
    assert.equal(bInitial.kind,'fresh');
    assert.deepEqual(bInitial.outputs,bExpected);
    const before=await terminateAtBarrier('precommit',fileOf(prePrincipal),
      root,prePrincipal,preInputs);
    assert.equal(before.killed,true);
    assert.equal(before.marker,'PRECOMMIT_BARRIER');
    const preAfterKill=/** @type {ReturnType<TransactionalRatchet['snapshot']>} */(
      withStore(prePrincipal,store=>store.snapshot(prePrincipal)));
    assert.deepEqual(preAfterKill,{seq:0,committed:0});
    const bAfterPre=/** @type {ReturnType<TransactionalRatchet['snapshot']>} */(
      withStore(bPrincipal,store=>store.snapshot(bPrincipal)));
    assert.deepEqual(bAfterPre,{seq:2,committed:2});

    const recoveredPre=/** @type {ReturnType<TransactionalRatchet['batch']>} */(
      withStore(prePrincipal,store=>store.batch(prePrincipal,0,preInputs)));
    assert.equal(recoveredPre.kind,'fresh');
    assert.equal(recoveredPre.privateExecutions,2);
    assert.deepEqual(recoveredPre.outputs,preExpected);
    const after=await terminateAtBarrier('postcommit',fileOf(postPrincipal),
      root,postPrincipal,postInputs);
    assert.equal(after.killed,true);
    assert.equal(after.marker,'POSTCOMMIT_BARRIER');

    const postAfterKill=/** @type {ReturnType<TransactionalRatchet['snapshot']>} */(
      withStore(postPrincipal,store=>store.snapshot(postPrincipal)));
    assert.deepEqual(postAfterKill,{seq:2,committed:2});
    const postRetry=/** @type {ReturnType<TransactionalRatchet['batch']>} */(
      withStore(postPrincipal,store=>store.batch(postPrincipal,0,postInputs)));
    assert.equal(postRetry.kind,'cached');
    assert.equal(postRetry.privateExecutions,0);
    assert.deepEqual(postRetry.outputs,postExpected);
    const altered=[challenge('different',0),postInputs[1]];
    const denied=/** @type {ReturnType<TransactionalRatchet['batch']>} */(
      withStore(postPrincipal,store=>store.batch(postPrincipal,0,altered)));
    assert.equal(denied.kind,'denied');
    const bRetry=/** @type {ReturnType<TransactionalRatchet['batch']>} */(
      withStore(bPrincipal,store=>store.batch(bPrincipal,0,bInputs)));
    assert.equal(bRetry.kind,'cached');
    assert.equal(bRetry.privateExecutions,0);
    assert.deepEqual(bRetry.outputs,bExpected);
    const bFinally=/** @type {ReturnType<TransactionalRatchet['snapshot']>} */(
      withStore(bPrincipal,store=>store.snapshot(bPrincipal)));
    assert.deepEqual(bFinally,{seq:2,committed:2});
    const preFinally=/** @type {ReturnType<TransactionalRatchet['snapshot']>} */(
      withStore(prePrincipal,store=>store.snapshot(prePrincipal)));
    assert.deepEqual(preFinally,{seq:2,committed:2});
    const files=fs.readdirSync(dir).filter(name=>name.endsWith('.sqlite'));
    assert.equal(files.length,8);
    const report={
      node:process.version,platform:process.platform,
      bucketCount:8,selectedRootTries:selection.tries,
      storageIndices:{before:preIndex,after:postIndex,b:bIndex},
      twoIndependentWorkersActuallyKilled:2,
      beforeCommit:{marker:before.marker,killed:before.killed,
        rowAfterKill:preAfterKill,otherBState:bAfterPre,
        retryKind:recoveredPre.kind,realProtectedEvents:recoveredPre.privateExecutions},
      afterCommit:{marker:after.marker,killed:after.killed,
        rowAfterKill:postAfterKill,retryKind:postRetry.kind,
        reexecutedPrivateEvents:postRetry.privateExecutions,
        modifiedReplay:denied.kind},
      bPersisted:bFinally,
      bCachedRetry:bRetry.kind,bCachedPrivateExecutions:bRetry.privateExecutions,
      prePersisted:preFinally,files:files.length,
      nativeOutputParity:true,
      boundary:'Actual OS SIGKILL around two SQLite commit boundaries in one bucket; independent B bucket persisted. This is not a power-loss, hostile filesystem, distributed transaction or 2.5x CPU test.'
    };
    process.stdout.write('SCO_RATCHET_BUCKET_CRASH '+JSON.stringify(report)+'\n');
    return report;
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

if(require.main===module){
  experiment().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={experiment,selectRoot};
