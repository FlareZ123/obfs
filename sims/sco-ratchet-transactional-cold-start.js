'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {randomBytes}=require('node:crypto');
const {TransactionalRatchet}=require('./sco-ratchet-transactional-store');
const {launch,stop}=require('./sco-ratchet-transactional-http');

/**
 * Search for concurrent start failures of actual Node SCO HTTP workers sharing
 * a cold versus preinitialized SQLite WAL file. All workers use a local
 * trusted DB, same HMAC root and two test authentication cookies; no client
 * can inspect private state. Existing positive HTTP behavior is checked for
 * every worker that succeeds at startup.
 *
 * @param {boolean} preinitialized
 * @param {number} trial
 * @param {number} [journalModeRetries]
 * @returns {Promise<{cohort:string,trial:number,elapsedMs:number,
 *   ready:number,failed:number,workerResults:Array<{kind:string,detail?:string}>}>}
 */
async function attempt(preinitialized,trial,journalModeRetries=4){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-ratchet-start-'));
  const databasePath=path.join(dir,'ratchet.sqlite');
  const root=randomBytes(32);
  const tokenA=randomBytes(32).toString('hex');
  const tokenB=randomBytes(32).toString('hex');
  const control=randomBytes(32).toString('hex');
  /** @type {Awaited<ReturnType<typeof launch>>[]} */
  const live=[];
  const start=performance.now();
  try{
    if(preinitialized){
      const seed=new TransactionalRatchet(databasePath,root);
      seed.close();
    }
    const requests=[
      launch(databasePath,root,tokenA,tokenB,control,false,journalModeRetries),
      launch(databasePath,root,tokenA,tokenB,control,false,journalModeRetries)
    ];
    const outcomes=await Promise.allSettled(requests);
    /** @type {{kind:string,detail?:string}[]} */
    const workerResults=[];
    for(const outcome of outcomes){
      if(outcome.status==='fulfilled'){
        const worker=outcome.value;
        live.push(worker);
        const unauthorized=await fetch(worker.base+'/obfs/batch.mjs');
        const authorized=await fetch(worker.base+'/obfs/batch.mjs',{
          headers:{cookie:'session='+tokenA}
        });
        assert.equal(unauthorized.status,403);
        assert.equal(authorized.status,200);
        assert.match(await authorized.text(),/batch/u);
        workerResults.push({kind:'ready'});
      }else{
        workerResults.push({kind:'startup-failed',
          detail:String(outcome.reason).slice(0,1000)});
      }
    }
    const ready=workerResults.filter(x=>x.kind==='ready').length;
    return {cohort:preinitialized?'preinitialized-bounded-retry':
      journalModeRetries===0?'cold-no-retry':'cold-bounded-retry',
      trial,elapsedMs:Number((performance.now()-start).toFixed(3)),
      ready,failed:workerResults.length-ready,workerResults};
  }finally{
    // Stop and observe every known worker before deleting SQLite on Windows.
    for(const worker of live)await stop(worker,control);
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

/** @returns {Promise<object>} */
async function experiment(){
  /** @type {Awaited<ReturnType<typeof attempt>>[]} */
  const rows=[];
  const cohorts=[
    {name:'cold-no-retry',preinitialized:false,retries:0},
    {name:'cold-bounded-retry',preinitialized:false,retries:4},
    {name:'preinitialized-bounded-retry',preinitialized:true,retries:4}
  ];
  for(const config of cohorts){
    for(let trial=0;trial<8;trial++){
      rows.push(await attempt(config.preinitialized,trial,config.retries));
    }
  }
  const summaries=cohorts.map(config=>{
    const cohort=config.name;
    const runs=rows.filter(row=>row.cohort===cohort);
    return {cohort,trials:runs.length,workersAttempted:runs.length*2,
      ready:runs.reduce((sum,row)=>sum+row.ready,0),
      failed:runs.reduce((sum,row)=>sum+row.failed,0),
      fullSuccessTrials:runs.filter(row=>row.failed===0).length};
  });
  const report={
    node:process.version,platform:process.platform,
    comparison:'Same-source concurrent cold SCO HTTP worker startup: no retry, bounded WAL retry, and trusted schema preinitialization',
    summaries,attempts:rows,
    boundary:'24 independent temp database trials, eight per cohort. A sample with zero failures does not prove a universal startup guarantee; no remote DB, power loss, obfuscation advantage or 2.5x runtime evidence.'
  };
  process.stdout.write('SCO_RATCHET_TRANSACTIONAL_COLD_START '+JSON.stringify(report)+'\n');
  return report;
}

if(require.main===module){
  experiment().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={experiment,attempt};
