'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomBytes,createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {TransactionalRatchet}=require('./sco-ratchet-transactional-store');
const {createPrivateMachine}=require('./sco-ratchet-boundary');

/** @typedef {import('./sco-ratchet-transactional-store').TransactionalRatchet} Store */
/** @typedef {{wallMs:number,cpuMs:number}} Sample */
/** @typedef {{kind:'fresh'|'cached'|'denied',outputs:string[],privateExecutions:number}} Decision */

/**
 * @param {()=>unknown} callback
 * @returns {{sample:Sample,value:unknown}}
 */
function timed(callback){
  const start=performance.now();
  const usage=process.cpuUsage();
  const value=callback();
  const delta=process.cpuUsage(usage);
  return {value,sample:{
    wallMs:performance.now()-start,
    cpuMs:(delta.user+delta.system)/1000
  }};
}

/** @param {string} principal @returns {string} */
function fileName(principal){
  return 'principal-'+createHash('sha256').update(principal).digest('hex')+'.sqlite';
}

/** @param {string} dir @returns {{files:number,bytes:number}} */
function footprint(dir){
  const names=fs.readdirSync(dir).filter(name=>name.endsWith('.sqlite'));
  return {files:names.length,bytes:names.reduce((sum,name)=>
    sum+fs.statSync(path.join(dir,name)).size,0)};
}

/**
 * @param {Buffer} root
 * @param {string[]} principals
 * @param {string[]} inputs
 * @returns {{outputs:string[],sample:Sample}}
 */
function original(root,principals,inputs){
  const {sample,value}=timed(()=>{
    const machine=createPrivateMachine(root);
    return principals.map((principal,index)=>{
      const output=machine.advance(principal,0,inputs[index]);
      assert.equal(typeof output,'string');
      return /** @type {string} */(output);
    });
  });
  return {sample,outputs:/** @type {string[]} */(value)};
}

/**
 * @param {number} count
 * @param {number} trial
 * @returns {object}
 */
function one(count,trial){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-shard-cold-'));
  const root=randomBytes(32);
  const principals=Array.from({length:count},(_,i)=>'verified-'+trial+'-'+i);
  const inputs=principals.map((principal,i)=>
    createHash('sha256').update('input/'+principal+'/'+i).digest('hex'));
  const sharedPath=path.join(temp,'shared.sqlite');
  const warmDir=path.join(temp,'warm');
  const coldDir=path.join(temp,'cold');
  fs.mkdirSync(warmDir);
  fs.mkdirSync(coldDir);
  /** @type {Store[]} */
  const live=[];
  /** @type {Record<string,{sample:Sample,decisions:Decision[]}>} */
  const arms={};
  try{
    const native=original(root,principals,inputs);
    const shared=new TransactionalRatchet(sharedPath,root);
    live.push(shared);
    /** @type {Store[]} */
    const warm=[];
    for(const principal of principals){
      const store=new TransactionalRatchet(path.join(warmDir,fileName(principal)),root);
      warm.push(store);
      live.push(store);
    }
    // All cold account files must genuinely be missing at first request.
    assert.equal(fs.readdirSync(coldDir).length,0);
    /** @returns {Decision[]} */
    function sharedWork(){
      return principals.map((p,i)=>shared.batch(p,0,[inputs[i]]));
    }
    /** @returns {Decision[]} */
    function warmWork(){
      return principals.map((p,i)=>warm[i].batch(p,0,[inputs[i]]));
    }
    /** @returns {Decision[]} */
    function coldWork(){
      return principals.map((p,i)=>{
        const store=new TransactionalRatchet(path.join(coldDir,fileName(p)),root);
        try{return store.batch(p,0,[inputs[i]]);}
        finally{store.close();}
      });
    }
    const callbacks={shared:sharedWork,warm:warmWork,cold:coldWork};
    const orders=[
      /** @type {('shared'|'warm'|'cold')[]} */(['shared','warm','cold']),
      /** @type {('shared'|'warm'|'cold')[]} */(['cold','warm','shared']),
      /** @type {('shared'|'warm'|'cold')[]} */(['warm','shared','cold'])
    ];
    const order=orders[trial%orders.length];
    for(const arm of order){
      const {sample,value}=timed(callbacks[arm]);
      const decisions=/** @type {Decision[]} */(value);
      assert.equal(decisions.length,count);
      for(let i=0;i<count;i++){
        assert.equal(decisions[i].kind,'fresh');
        assert.equal(decisions[i].privateExecutions,1);
        assert.deepEqual(decisions[i].outputs,[native.outputs[i]]);
      }
      arms[arm]={sample,decisions};
    }
    for(const store of live)store.close();
    live.length=0;
    const sharedBytes=fs.statSync(sharedPath).size;
    const footprints={shared:{files:1,bytes:sharedBytes},
      warm:footprint(warmDir),cold:footprint(coldDir)};
    assert.equal(footprints.warm.files,count);
    assert.equal(footprints.cold.files,count);
    /** @param {'shared'|'warm'|'cold'} key @returns {object} */
    function observation(key){
      const sample=arms[key].sample;
      return {
        wallMs:Number(sample.wallMs.toFixed(3)),
        cpuMs:Number(sample.cpuMs.toFixed(3)),
        wallRatio:Number((sample.wallMs/native.sample.wallMs).toFixed(5)),
        cpuRatio:native.sample.cpuMs>0&&sample.cpuMs>0?
          Number((sample.cpuMs/native.sample.cpuMs).toFixed(5)):null
      };
    }
    return {
      count,trial,order,
      original:{
        wallMs:Number(native.sample.wallMs.toFixed(3)),
        cpuMs:Number(native.sample.cpuMs.toFixed(3))
      },
      shared:observation('shared'),warm:observation('warm'),cold:observation('cold'),
      footprints,
      nativeOutputParity:true,
      coldWasEmpty:true
    };
  }finally{
    for(const store of live)store.close();
    fs.rmSync(temp,{recursive:true,force:true});
  }
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @returns {object} */
function experiment(){
  /** @type {object[]} */
  const trials=[];
  for(const count of [1,8,64]){
    for(let trial=0;trial<5;trial++)trials.push(one(count,trial));
  }
  const summary=[1,8,64].map(count=>{
    const rows=trials.filter(row=>
      /** @type {{count:number}} */(row).count===count);
    /** @param {'shared'|'warm'|'cold'} arm @returns {object} */
    function armSummary(arm){
      const samples=rows.map(row=>
        /** @type {{shared:{wallRatio:number,cpuRatio:number|null},
        warm:{wallRatio:number,cpuRatio:number|null},
        cold:{wallRatio:number,cpuRatio:number|null}}} */(row)[arm]);
      const measurableCpu=samples.filter(s=>s.cpuRatio!==null);
      return {
        medianWallRatio:median(samples.map(s=>s.wallRatio)),
        measuredCpuPairs:measurableCpu.length,
        medianCpuRatio:measurableCpu.length?
          median(measurableCpu.map(s=>/** @type {number} */(s.cpuRatio))):null,
        strictWallOver2_5:samples.filter(s=>s.wallRatio>2.5).length,
        strictCpuOver2_5:measurableCpu.filter(s=>s.cpuRatio!==null&&s.cpuRatio>2.5).length
      };
    }
    return {accounts:count,shared:armSummary('shared'),
      warm:armSummary('warm'),cold:armSummary('cold')};
  });
  const report={
    node:process.version,platform:process.platform,
    privateWorkBytesPerEvent:8*1024*1024,
    controlledVerifiedPrincipalsPerSession:[1,8,64],
    fiveTrialsPerAccountCount:true,
    summary,trials,
    boundary:'Trusted single-host Node SQLite storage model; native original first-call HMAC parity. Constructor costs excluded for warm stores and included for per-account cold JIT. Wall and CPU ratios are scoped local sessions, not end-to-end SCO client or security gains.'
  };
  process.stdout.write('SCO_RATCHET_SHARD_COLD_ADMISSION '+JSON.stringify(report)+'\n');
  return report;
}

if(require.main===module){
  try{experiment();}catch(error){console.error(error);process.exitCode=1;}
}
module.exports={experiment,one};
