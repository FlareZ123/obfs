'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {performance}=require('node:perf_hooks');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {atomicWrite}=require('../src/atomic');
const {pairedBudgetBound}=require('./paired-budget-bound');
const {ROOT,EXPOSED}=require('../examples/application-challenge/sco-build.cjs');
const {startServer}=require('../examples/application-challenge/sco-server.cjs');

const executeFile=promisify(execFile);
const counts=[1,1000,10000,30000,60000,90000,120000,150000];
const samplePairs=11;

/** @param {number[]} numbers @returns {number} */
function median(numbers){
  const values=[...numbers].sort((a,b)=>a-b);
  return values[Math.floor(values.length/2)];
}

/**
 * Measure one fresh Node child through complete JSON output. The trusted
 * source-private SCO server is already initialized in the parent process.
 * @param {string[]} args
 * @returns {Promise<{value:unknown,ms:number}>}
 */
async function invoke(args){
  const begin=performance.now();
  const output=await executeFile(process.execPath,args,{
    encoding:'utf8',timeout:30000,maxBuffer:1024*1024
  });
  return {value:JSON.parse(output.stdout),ms:performance.now()-begin};
}

/**
 * Nine fixed, preregistered computational granularities across the same
 * frozen application. Alternating native/remote order reduces systematic
 * run-order bias, but does not make noisy CI samples independent.
 * @returns {Promise<void>}
 */
async function main(){
  const originalWindow=globalThis.window;
  const service=await startServer({token:'sco-count-grid-token-2026-11-17'});
  const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'sco-count-grid-'));
  try {
    const publicFile=path.join(scratch,'facade.mjs');
    await atomicWrite(publicFile,await fs.readFile(path.join(ROOT,'sco-public',EXPOSED)));
    const nativeEntry=path.join(ROOT,'before','entry.mjs');
    const attackerChild=path.join(__dirname,'application-challenge-sco-relay-child.cjs');
    /** @type {{count:number,nativeMedianMs:number,remoteMedianMs:number,
     * ratioOfMedians:number,paired:ReturnType<typeof pairedBudgetBound>,
     * nativeSamples:number[],remoteSamples:number[]}[]} */
    const results=[];
    for(const count of counts){
      const cases=[
        [0x12345678,count],
        [0xffffffff,count],
        [0x9e3779b9,count]
      ];
      const baselineArgs=[nativeEntry,JSON.stringify(cases)];
      const remoteArgs=[attackerChild,publicFile,service.origin,
        service.token,JSON.stringify(cases)];
      const reference=await invoke(baselineArgs);
      const firstRemote=await invoke(remoteArgs);
      assert.deepEqual(firstRemote.value,reference.value,
        'Native/generated warmup mismatch at count '+count);
      /** @type {number[]} */
      const nativeSamples=[];
      /** @type {number[]} */
      const remoteSamples=[];
      for(let trial=0;trial<samplePairs;trial++){
        const order=trial%2===0?['native','remote']:['remote','native'];
        for(const kind of order){
          const observed=await invoke(kind==='native'?baselineArgs:remoteArgs);
          assert.deepEqual(observed.value,reference.value,
            'Native/generated output changed at count '+count+'/'+trial+'/'+kind);
          if(kind==='native')nativeSamples.push(observed.ms);
          else remoteSamples.push(observed.ms);
        }
      }
      const paired=pairedBudgetBound(nativeSamples,remoteSamples);
      results.push({
        count,
        nativeMedianMs:median(nativeSamples),
        remoteMedianMs:median(remoteSamples),
        ratioOfMedians:median(remoteSamples)/median(nativeSamples),
        paired,nativeSamples,remoteSamples
      });
    }
    assert.equal(results.length,counts.length);
    process.stdout.write('APPLICATION_SCO_COUNT_GRID '+JSON.stringify({
      platform:process.platform,node:process.version,kind:'source-pinned frozen SCO application',
      operationsPerFreshClient:3,counts,samplePairs,
      transport:'localhost HTTP/1.1',
      boundary:'fresh Node child process launch through complete JSON output',
      trustedServerAlreadyInitialized:true,
      semanticsPreserved:true,
      results
    })+'\n');
  }finally{
    await fs.rm(scratch,{recursive:true,force:true});
    await new Promise((resolve,reject)=>service.server.close(
      error=>error?reject(error):resolve()));
    if(originalWindow===undefined)delete globalThis.window;
    else globalThis.window=originalWindow;
  }
}
if(require.main===module)main();
module.exports={main,counts,samplePairs};
