'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const readline=require('node:readline');
const {spawn}=require('node:child_process');
const {randomBytes,createHash}=require('node:crypto');
const {TransactionalRatchet}=require('./sco-ratchet-transactional-store');
const {createPrivateMachine}=require('./sco-ratchet-boundary');

/** @param {string} label @param {number} index @returns {string} */
function challenge(label,index){
  return createHash('sha256').update(label+'/'+index).digest('hex');
}

/** @param {Buffer} root @param {string} principal
 * @param {string[]} inputs @returns {string[]}
 */
function expected(root,principal,inputs){
  const machine=createPrivateMachine(root);
  return inputs.map((value,index)=>{
    const output=machine.advance(principal,index,value);
    assert.equal(typeof output,'string');
    return /** @type {string} */(output);
  });
}

/**
 * Force a real independently started Node process to terminate while holding
 * a precise test-only barrier. No callback returns from that barrier.
 * @param {'precommit'|'postcommit'} mode
 * @param {string} dbPath
 * @param {Buffer} root
 * @param {string} principal
 * @param {string[]} inputs
 * @returns {Promise<{marker:string,killed:boolean,exitCode:number|null}>}
 */
async function terminateAtBarrier(mode,dbPath,root,principal,inputs){
  const child=spawn(process.execPath,[require.resolve('./sco-ratchet-transactional-crash-child')],{
    env:{...process.env,SCO_CRASH_MODE:mode,SCO_CRASH_DB:dbPath,
      SCO_CRASH_ROOT:root.toString('hex'),SCO_CRASH_PRINCIPAL:principal,
      SCO_CRASH_INPUTS:JSON.stringify(inputs)},
    stdio:['ignore','pipe','pipe']
  });
  assert.ok(child.stdout);
  const stream=readline.createInterface({input:child.stdout});
  const expectedMarker=mode==='precommit'?'PRECOMMIT_BARRIER':'POSTCOMMIT_BARRIER';
  /** @type {Promise<string>} */
  const announced=new Promise((resolve,reject)=>{
    stream.once('line',resolve);
    child.once('error',reject);
    child.once('exit',code=>reject(new Error('Crash worker exited early: '+code)));
  });
  try{
    const marker=await announced;
    assert.equal(marker,expectedMarker);
    /** @type {Promise<[number|null,NodeJS.Signals|null]>} */
    const terminated=new Promise(resolve=>child.once('exit',(code,signal)=>resolve([code,signal])));
    const killed=child.kill('SIGKILL');
    assert.equal(killed,true,'Operating system refused worker termination');
    const [exitCode]=await terminated;
    assert.notEqual(exitCode,0,'Fault worker unexpectedly exited normally');
    return {marker,killed,exitCode};
  }finally{
    stream.close();
    if(child.exitCode===null&&!child.killed)child.kill('SIGKILL');
  }
}

/**
 * @returns {Promise<object>}
 */
async function experiment(){
  const root=randomBytes(32);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-ratchet-fault-'));
  const dbPath=path.join(dir,'trusted.sqlite');
  const beforeInputs=[challenge('before',0),challenge('before',1)];
  const afterInputs=[challenge('after',0),challenge('after',1)];
  const modified=[challenge('other',0),afterInputs[1]];
  const beforePrincipal='verified-before-commit';
  const afterPrincipal='verified-after-commit';
  try{
    const pre=await terminateAtBarrier('precommit',dbPath,root,
      beforePrincipal,beforeInputs);
    const recovered=new TransactionalRatchet(dbPath,root);
    let preResult;
    try{
      const empty=recovered.snapshot(beforePrincipal);
      assert.deepEqual(empty,{seq:0,committed:0},
        'Killed uncommitted SQL upsert must be rolled back');
      const fresh=recovered.batch(beforePrincipal,0,beforeInputs);
      assert.equal(fresh.kind,'fresh');
      assert.equal(fresh.privateExecutions,2);
      assert.deepEqual(fresh.outputs,expected(root,beforePrincipal,beforeInputs));
      assert.deepEqual(recovered.snapshot(beforePrincipal),{seq:2,committed:2});
      preResult={marker:pre.marker,killed:pre.killed,
        durableEventsBeforeRecovery:empty.committed,
        recoveryKind:fresh.kind,durableEventsAfterRecovery:2,
        originalOutputParity:true};
    }finally{recovered.close();}

    const post=await terminateAtBarrier('postcommit',dbPath,root,
      afterPrincipal,afterInputs);
    const second=new TransactionalRatchet(dbPath,root);
    let postResult;
    try{
      const committed=second.snapshot(afterPrincipal);
      assert.deepEqual(committed,{seq:2,committed:2});
      const cached=second.batch(afterPrincipal,0,afterInputs);
      assert.equal(cached.kind,'cached');
      assert.equal(cached.privateExecutions,0);
      assert.deepEqual(cached.outputs,expected(root,afterPrincipal,afterInputs));
      const denied=second.batch(afterPrincipal,0,modified);
      assert.equal(denied.kind,'denied');
      assert.equal(second.snapshot(afterPrincipal).committed,2);
      postResult={marker:post.marker,killed:post.killed,
        durableEventsAtRecovery:committed.committed,retryKind:cached.kind,
        repeatedPrivateEvents:cached.privateExecutions,
        modifiedRetryKind:denied.kind,originalOutputParity:true};
    }finally{second.close();}
    const report={
      node:process.version,platform:process.platform,
      privateWorkBytesPerEvent:8*1024*1024,independentOsProcessesKilled:2,
      beforeCommit:preResult,afterCommit:postResult,
      boundary:'Actual process kill at two injected SQL boundaries; not a machine power failure, external side-effect transaction, multi-host store, or 2.5x CPU-compute proof.'
    };
    process.stdout.write('SCO_RATCHET_TRANSACTIONAL_CRASH '+JSON.stringify(report)+'\n');
    return report;
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

if(require.main===module){
  experiment().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={experiment,terminateAtBarrier};
