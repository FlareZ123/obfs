'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {performance}=require('node:perf_hooks');
const {startServer}=require('../examples/application-challenge/sco-server.cjs');
const {ROOT,EXPOSED}=require('../examples/application-challenge/sco-build.cjs');
const {pairedBudgetBound}=require('./paired-budget-bound');
const {atomicWrite}=require('../src/atomic');

/** @typedef {(seed:number,count:number)=>Promise<unknown>} Evaluate */
/** @typedef {{cpuMs:number,wallMs:number,values:unknown[]}} Observation */
/** @typedef {{count:number,repetitions:number,calls:number,nativeCpuMs:number[],remoteCpuMs:number[],nativeWallMs:number[],remoteWallMs:number[],cpuBound:ReturnType<typeof pairedBudgetBound>|null,wallBound:ReturnType<typeof pairedBudgetBound>,strictCpuOverBudgetPairs:number,unresolvedCpuPairs:number,strictWallOverBudgetPairs:number}} Workload */

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
  assert.ok(Number.isFinite(cpuMs)&&cpuMs>=0,'Expected nonnegative process CPU');
  assert.ok(Number.isFinite(wallMs)&&wallMs>0,'Expected measured positive wall time');
  return {cpuMs,wallMs,values};
}

/**
 * @param {number} [rounds]
 * @param {boolean} [resolutionAmplified] Execute 12,288 authenticated 1k-iteration calls per trial to resolve Windows native CPU quantization.
 * @returns {Promise<{source:string,node:string,platform:NodeJS.Platform,initializationExcluded:boolean,resolutionAmplified:boolean,cpuScope:string,rows:Workload[],strictCpuBreaches:number,unresolvedCpuPairs:number,strictWallBreaches:number}>}
 */
async function run(rounds=13,resolutionAmplified=false){
  if(!Number.isSafeInteger(rounds)||rounds<9||rounds>100)
    throw new RangeError('Expected 9 through 100 paired SCO observations');
  if(typeof resolutionAmplified!=='boolean')
    throw new TypeError('Expected boolean short-work amplification selection');
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
    const work=resolutionAmplified?[[1000,4096]]:[[1,64],[1000,64],[120000,64]];
    for(const [count,repetitions] of work){
      const inputs=/** @type {Array<readonly [number,number]>} */ ([
        [0x12345678,count],[0xffffffff,count],[0x9e3779b9,count]
      ]);
      for(let warm=0;warm<3;warm++){
        const original=await observe(native,inputs,repetitions);
        const remote=await observe(published,inputs,repetitions);
        assert.equal(JSON.stringify(remote.values),JSON.stringify(original.values),
          'SCO warmup changed JSON-wire output');
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
        assert.equal(JSON.stringify(remote.values),JSON.stringify(original.values),
          'Authenticated SCO facade changed JSON-wire outputs');
        nativeCpuMs.push(original.cpuMs);
        remoteCpuMs.push(remote.cpuMs);
        nativeWallMs.push(original.wallMs);
        remoteWallMs.push(remote.wallMs);
      }
      const unresolvedCpuPairs=nativeCpuMs.filter((ms,index)=>
        ms===0||remoteCpuMs[index]===0).length;
      rows.push({
        count,repetitions,calls:inputs.length*repetitions,
        nativeCpuMs,remoteCpuMs,nativeWallMs,remoteWallMs,
        cpuBound:unresolvedCpuPairs===0?pairedBudgetBound(nativeCpuMs,remoteCpuMs):null,
        unresolvedCpuPairs,
        wallBound:pairedBudgetBound(nativeWallMs,remoteWallMs),
        strictCpuOverBudgetPairs:nativeCpuMs.filter((ms,index)=>
          ms>0&&remoteCpuMs[index]>0&&remoteCpuMs[index]>2.5*ms).length,
        strictWallOverBudgetPairs:nativeWallMs.filter((ms,index)=>
          remoteWallMs[index]>2.5*ms).length
      });
    }
    return {
      source:'sims/sco-resident-cpu.js',node:process.version,
      platform:process.platform,initializationExcluded:true,resolutionAmplified,
      cpuScope:'Whole-process Node CPU includes same-process loopback client and trusted server after startup. CPU observations of zero are marked unresolved due to clock quantization. Wall time includes network waiting. Output parity is checked after JSON serialization, the declared RPC value boundary.',
      rows,
      strictCpuBreaches:rows.reduce((sum,row)=>sum+row.strictCpuOverBudgetPairs,0),
      unresolvedCpuPairs:rows.reduce((sum,row)=>sum+row.unresolvedCpuPairs,0),
      strictWallBreaches:rows.reduce((sum,row)=>sum+row.strictWallOverBudgetPairs,0)
    };
  }finally{
    globalThis.fetch=originalFetch;
    if(service){
      const server=service.server;
      await new Promise((resolve,reject)=>server.close(
        error=>error?reject(error):resolve(undefined)));
    }
    if(oldWindow===undefined)Reflect.deleteProperty(globalThis,'window');
    else globalThis.window=oldWindow;
  }
}
if(require.main===module)run(13,process.argv.includes('--amplify-short')).then(async result=>{
  const serialized=JSON.stringify(result);
  if(process.env.OBFS_SCO_RESIDENT_AUDIT_FILE){
    await atomicWrite(process.env.OBFS_SCO_RESIDENT_AUDIT_FILE,
      JSON.stringify(result,null,2)+'\n');
  }
  process.stdout.write('SCO_RESIDENT_CPU '+serialized+'\n');
}).catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={run,observe};
