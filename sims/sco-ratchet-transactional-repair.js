'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomBytes,createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {performance}=require('node:perf_hooks');
const {TransactionalRatchet}=require('./sco-ratchet-transactional-store');
const {createPrivateMachine}=require('./sco-ratchet-boundary');

const execFileAsync=promisify(execFile);

/** @typedef {import('./sco-ratchet-transactional-store').TransactionalRatchet} Store */
/** @typedef {{kind:'fresh'|'cached'|'denied',outputs:string[],
 *   privateExecutions:number}} Decision */

/** @param {string} label @param {number} index @returns {string} */
function challenge(label,index){
  return createHash('sha256').update(label+'/'+index).digest('hex');
}

/** @param {Buffer} root @param {string} principal @param {number} start
 * @param {string[]} inputs @returns {string[]}
 */
function original(root,principal,start,inputs){
  const machine=createPrivateMachine(root);
  // All existing parent observations of this helper begin at sequence zero.
  assert.equal(start,0);
  return inputs.map((value,index)=>{
    const output=machine.advance(principal,index,value);
    assert.equal(typeof output,'string');
    return /** @type {string} */(output);
  });
}

/**
 * @param {string} dbPath
 * @param {Buffer} root
 * @param {string} principal
 * @param {number} start
 * @param {string[]} inputs
 * @returns {Promise<Decision>}
 */
async function child(dbPath,root,principal,start,inputs){
  const {stdout}=await execFileAsync(process.execPath,[
    require.resolve('./sco-ratchet-transactional-child'),
    dbPath,principal,String(start),JSON.stringify(inputs)
  ],{
    timeout:60000,maxBuffer:256*1024,encoding:'utf8',
    env:{...process.env,SCO_RATCHET_TEST_ROOT:root.toString('hex')}
  });
  return /** @type {Decision} */(JSON.parse(stdout));
}

/**
 * @param {()=>unknown} callback
 * @returns {{wallMs:number,cpuMs:number}}
 */
function timed(callback){
  const wall=performance.now();
  const usage=process.cpuUsage();
  callback();
  const cpu=process.cpuUsage(usage);
  return {wallMs:performance.now()-wall,cpuMs:(cpu.user+cpu.system)/1000};
}

/** @param {number[]} nums @returns {number} */
function median(nums){
  const ordered=[...nums].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/** @param {Buffer} root @param {Store} store @returns {object} */
function profile(root,store){
  /** @type {{count:number,trial:number,nativeCpuMs:number,storedCpuMs:number,
   * nativeWallMs:number,storedWallMs:number,cpuRatio:number,wallRatio:number}[]} */
  const trials=[];
  for(const count of [1,16,64]){
    for(let trial=0;trial<7;trial++){
      const principal='profile-'+count+'-'+trial;
      const inputs=Array.from({length:count},(_,i)=>challenge('profile',i));
      const native=createPrivateMachine(root);
      /** @type {string[]} */
      let nativeResult=[];
      /** @type {Decision|undefined} */
      let storedResult;
      const nativeWork=()=>{nativeResult=inputs.map((value,index)=>{
        const output=native.advance(principal,index,value);
        assert.equal(typeof output,'string');
        return /** @type {string} */(output);
      });};
      const storedWork=()=>{storedResult=store.batch(principal,0,inputs);};
      const nativeTimes=trial%2===0?timed(nativeWork):null;
      const storedTimes=timed(storedWork);
      const nativeFinal=nativeTimes??timed(nativeWork);
      assert.equal(storedResult?.kind,'fresh');
      assert.deepEqual(storedResult.outputs,nativeResult);
      assert.equal(store.snapshot(principal).committed,count);
      trials.push({
        count,trial,nativeCpuMs:nativeFinal.cpuMs,storedCpuMs:storedTimes.cpuMs,
        nativeWallMs:nativeFinal.wallMs,storedWallMs:storedTimes.wallMs,
        cpuRatio:storedTimes.cpuMs/nativeFinal.cpuMs,
        wallRatio:storedTimes.wallMs/nativeFinal.wallMs
      });
    }
  }
  return [1,16,64].map(count=>{
    const rows=trials.filter(item=>item.count===count);
    return {
      count,pairs:rows.length,medianCpuRatio:median(rows.map(row=>row.cpuRatio)),
      medianWallRatio:median(rows.map(row=>row.wallRatio)),
      strictCpuOverBudgetPairs:rows.filter(row=>row.cpuRatio>2.5).length,
      strictWallOverBudgetPairs:rows.filter(row=>row.wallRatio>2.5).length,
      raw:rows.map(row=>({
        nativeCpuMs:row.nativeCpuMs,storedCpuMs:row.storedCpuMs,
        nativeWallMs:row.nativeWallMs,storedWallMs:row.storedWallMs,
        cpuRatio:Number(row.cpuRatio.toFixed(5)),
        wallRatio:Number(row.wallRatio.toFixed(5))
      }))
    };
  });
}

/**
 * Demonstrate the narrow shared local database repair for the earlier two
 * trusted-replica split-brain counterexample. The store is an experimental
 * component without HTTP authorization or distributed deployment support.
 *
 * @returns {Promise<object>}
 */
async function experiment(){
  const root=randomBytes(32);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-ratchet-db-'));
  const dbPath=path.join(temp,'trusted.sqlite');
  /** @type {Store[]} */
  const opened=[];
  /** @returns {Store} */
  const open=()=>{const store=new TransactionalRatchet(dbPath,root);opened.push(store);return store;};
  try{
    const left=open();
    const right=open();
    const principal='verified-A';
    const first=[challenge('first',0),challenge('first',1)];
    const next=[challenge('next',2),challenge('next',3)];
    const changed=[challenge('changed',0),first[1]];
    const native=createPrivateMachine(root);
    const expectedFirst=first.map((value,index)=>{
      const result=native.advance(principal,index,value);
      assert.equal(typeof result,'string');
      return /** @type {string} */(result);
    });
    const expectedNext=next.map((value,index)=>{
      const result=native.advance(principal,index+2,value);
      assert.equal(typeof result,'string');
      return /** @type {string} */(result);
    });
    const leftFirst=left.batch(principal,0,first);
    const repeatedRight=right.batch(principal,0,first);
    const changedRight=right.batch(principal,0,changed);
    const advanceRight=right.batch(principal,2,next);
    const staleLeft=left.batch(principal,0,first);
    assert.deepEqual([leftFirst.kind,repeatedRight.kind,changedRight.kind,
      advanceRight.kind,staleLeft.kind],
    ['fresh','cached','denied','fresh','denied']);
    assert.deepEqual([leftFirst.outputs,repeatedRight.outputs],
      [expectedFirst,expectedFirst]);
    assert.deepEqual(advanceRight.outputs,expectedNext);
    assert.deepEqual(left.snapshot(principal),{seq:4,committed:4});

    const bInputs=[challenge('B',0),challenge('B',1)];
    const accountB=left.batch('verified-B',0,bInputs);
    assert.equal(accountB.kind,'fresh');
    assert.deepEqual(accountB.outputs,original(root,'verified-B',0,bInputs));
    assert.notDeepEqual(accountB.outputs,expectedFirst);
    assert.equal(right.snapshot('verified-B').committed,2);

    for(const store of opened)store.close();
    opened.length=0;
    assert.throws(()=>new TransactionalRatchet(dbPath,randomBytes(32)),
      /Ratchet root differs/u);
    const afterRestart=open();
    const lastCached=afterRestart.batch(principal,2,next);
    const ancient=afterRestart.batch(principal,0,first);
    assert.deepEqual([lastCached.kind,ancient.kind],['cached','denied']);
    assert.deepEqual(lastCached.outputs,expectedNext);
    assert.equal(afterRestart.snapshot(principal).committed,4);

    // Independently started child processes contend on the same local file.
    const identical=[challenge('same-process-race',0),challenge('same-process-race',1)];
    const same=await Promise.all([
      child(dbPath,root,'race-identical',0,identical),
      child(dbPath,root,'race-identical',0,identical)
    ]);
    assert.deepEqual(same.map(item=>item.kind).sort(),['cached','fresh']);
    for(const item of same)assert.deepEqual(item.outputs,
      original(root,'race-identical',0,identical));
    assert.equal(same.reduce((sum,row)=>sum+row.privateExecutions,0),2);
    assert.deepEqual(afterRestart.snapshot('race-identical'),{seq:2,committed:2});

    const firstAlternative=[challenge('race-different',0),challenge('race-different',1)];
    const secondAlternative=[challenge('race-other',0),challenge('race-other',1)];
    const different=await Promise.all([
      child(dbPath,root,'race-different',0,firstAlternative),
      child(dbPath,root,'race-different',0,secondAlternative)
    ]);
    assert.deepEqual(different.map(item=>item.kind).sort(),['denied','fresh']);
    const winning=different[0].kind==='fresh'?0:1;
    assert.deepEqual(different[winning].outputs,original(root,'race-different',0,
      winning===0?firstAlternative:secondAlternative));
    assert.deepEqual(afterRestart.snapshot('race-different'),{seq:2,committed:2});

    const budget=profile(root,afterRestart);
    const report={
      node:process.version,platform:process.platform,sqliteExperimental:true,
      storage:'single-host SQLite WAL with FULL durability and BEGIN IMMEDIATE writer lock',
      privateWorkBytesPerEvent:8*1024*1024,
      verifiedAccountCount:2,
      sameHostReplicas:{decisions:[leftFirst.kind,repeatedRight.kind,changedRight.kind,
        advanceRight.kind,staleLeft.kind],committedEvents:4},
      restart:{lastResult:lastCached.kind,olderResult:ancient.kind,
        committedEvents:4,wrongRootRejected:true},
      independentChildRace:{
        sameBatchDecisions:same.map(row=>row.kind).sort(),
        differentBatchDecisions:different.map(row=>row.kind).sort(),
        committedEventsPerCase:2,originalOutputParity:true
      },
      accountSeparation:true,strictSampledPostInitBudget:budget,
      boundary:'State engine only, no HTTP/RPC integration or actual crash. Shared local filesystem not a distributed consensus store; global writer lock may impede unrelated tenants; 2.5x whole-program target unproved.'
    };
    process.stdout.write('SCO_RATCHET_TRANSACTIONAL_REPAIR '+JSON.stringify(report)+'\n');
    return report;
  }finally{
    for(const store of opened)store.close();
    fs.rmSync(temp,{recursive:true,force:true});
  }
}

if(require.main===module){
  experiment().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={experiment};
