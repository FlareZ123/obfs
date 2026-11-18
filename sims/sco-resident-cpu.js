'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {performance}=require('node:perf_hooks');
const {startServer}=require('../examples/application-challenge/sco-server.cjs');
const {ROOT,EXPOSED}=require('../examples/application-challenge/sco-build.cjs');
const {pairedBudgetBound}=require('./paired-budget-bound');

/** @typedef {(seed:number,count:number)=>Promise<unknown>} Evaluate */
/** @typedef {{cpuMs:number,wallMs:number,values:unknown[]}} Observation */
/** @typedef {{count:number,repetitions:number,calls:number,nativeCpuMs:number[],remoteCpuMs:number[],nativeWallMs:number[],remoteWallMs:number[],cpuBound:ReturnType<typeof pairedBudgetBound>,wallBound:ReturnType<typeof pairedBudgetBound>,strictCpuOverBudgetPairs:number,strictWallOverBudgetPairs:number}} Workload */

/**
 * Measure direct server-owned ESM execution and authenticated HTTP facade calls
 * in the same initialized Node process. Process CPU accounts for client and
 * server work on both sides of the loopback HTTP boundary; wall time includes
 * transport waiting. This is a CPU attribution experiment, not a server-only
 * CPU estimate or a cross-machine latency guarantee.
 *
 * @param {Evaluate} call
 * @param {Array<readonly [number,number]>} inputs
 * @param {number} repetitions
 * @returns {Promise<Observation>}
 */
async function observe(call,inputs,repetitions){
  /** @type {unknown[]} */
  const values=[];
  const before=process.cpuUsage();
  const start=performance.now();
  for(let repeat=0;repeat<repetitions;repeat++){
    for(const [seed,count] of inputs){
      values.push(await call(seed,count));
    }
  }
  const wallMs=performance.now()-start;
  const used=process.cpuUsage(before);
  const cpuMs=(used.user+used.system)/1000;
  assert.ok(Number.isFinite(cpuMs)&&cpuMs>0,'Expected measured positive process CPU');
  assert.ok(Number.isFinite(wallMs)&&wallMs>0,'Expected measured positive wall time');
  return {cpuMs,wallMs,values};
}

/**
 * @param {number} [rounds]
 * @returns {Promise<{source:string,node:string,platform:NodeJS.Platform,initializationExcluded:boolean,cpuScope:string,rows:Workload[],strictCpuBreaches:number,strictWallBreaches:number}>}
 */
async function run(rounds=13){
  if(!Number.isSafeInteger(rounds)||rounds<9||rounds>100)
    throw new RangeError('Expected 9 through 100 paired SCO observations');
  const oldWindow=globalThis.window;
  const originalFetch=globalThis.fetch;
  /** @type {Awaited<ReturnType<typeof startServer>>|undefined} */
  let service;
  try{
    service=await startServer({token:'sco-resident-cpu-fixture-token-2026'});
    const origin=service.origin;
    const token=service.token;
    globalThis.fetch=(input,init)=>{
      const headers=new Headers(init?.headers);
      headers.set('x-demo-token',token);
      return originalFetch(new URL(String(input),origin),{...init,headers});
    };
    const facade=/** @type {{evaluateRemote:Evaluate}} */(
      await import(pathToFileURL(path.join(ROOT,'sco-public',EXPOSED)).href));
    const native=/** @type {Evaluate} */ (service.native);
    const published=facade.evaluateRemote;
    assert.equal(typeof published,'function','Expected generated facade function');

    /** @type {Workload[]} */
    const rows=[];
    for(const [count,repetitions] of [[1,64],[1000,24],[120000,1]]){
      const inputs=/** @type {Array<readonly [number,number]>} */ ([
        [0x12345678,count],[0xffffffff,count],[0x9e3779b9,count]
      ]);
      for(let warm=0;warm<3;warm++){
        const original=await observe(native,inputs,repetitions);
        const remote=await observe(published,inputs,repetitions);
        assert.deepEqual(remote.values,original.values,'SCO warmup changed output');
      }
      /** @type {number[]} */
      const nativeCpuMs=[];
      /** @type {number[]} */
      const remoteCpuMs=[];
      /** @type {number[]} */
      const nativeWallMs=[];
      /** @type {number[]} */
      const remoteWallMs=[];
      for(let trial=0;trial<rounds;trial++){
        let original;
        let remote;
        if(trial%2===0){
          original=await observe(native,inputs,repetitions);
          remote=await observe(published,inputs,repetitions);
        }else{
          remote=await observe(published,inputs,repetitions);
          original=await observe(native,inputs,repetitions);
        }
        assert.deepEqual(remote.values,original.values,
          'Authenticated SCO facade changed trusted native outputs');
        nativeCpuMs.push(original.cpuMs);
        remoteCpuMs.push(remote.cpuMs);
        nativeWallMs.push(original.wallMs);
        remoteWallMs.push(remote.wallMs);
      }
      rows.push({
        count,repetitions,calls:inputs.length*repetitions,
        nativeCpuMs,remoteCpuMs,nativeWallMs,remoteWallMs,
        cpuBound:pairedBudgetBound(nativeCpuMs,remoteCpuMs),
        wallBound:pairedBudgetBound(nativeWallMs,remoteWallMs),
        strictCpuOverBudgetPairs:nativeCpuMs.filter((ms,index)=>
          remoteCpuMs[index]>2.5*ms).length,
        strictWallOverBudgetPairs:nativeWallMs.filter((ms,index)=>
          remoteWallMs[index]>2.5*ms).length
      });
    }
    return {
      source:'sims/sco-resident-cpu.js',node:process.version,
      platform:process.platform,initializationExcluded:true,
      cpuScope:'Whole-process Node CPU, including both same-process loopback HTTP client and trusted server; established service, imported facade and authorization are active. Network waiting is counted only in wall time.',
      rows,
      strictCpuBreaches:rows.reduce((sum,row)=>sum+row.strictCpuOverBudgetPairs,0),
      strictWallBreaches:rows.reduce((sum,row)=>sum+row.strictWallOverBudgetPairs,0)
    };
  }finally{
    globalThis.fetch=originalFetch;
    if(service)await new Promise((resolve,reject)=>service.server.close(
      error=>error?reject(error):resolve()));
    if(oldWindow===undefined)delete globalThis.window;
    else globalThis.window=oldWindow;
  }
}
if(require.main===module)run().then(result=>
  process.stdout.write('SCO_RESIDENT_CPU '+JSON.stringify(result)+'\n')
).catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={run,observe};
