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
/** @param {number[]} observations @returns {number} */
function median(observations){
  const xs=[...observations].sort((a,b)=>a-b);
  return xs[Math.floor(xs.length/2)];
}

/**
 * Measure a fresh, independent Node process from launch through JSON output.
 * This includes client startup, ESM parse/evaluation and remote RPC where
 * applicable. The original trusted server is running separately.
 * @param {string[]} args
 * @returns {Promise<{value:unknown[],ms:number}>}
 */
async function invoke(args){
  const begin=performance.now();
  const result=await executeFile(process.execPath,args,{
    encoding:'utf8',timeout:30000,maxBuffer:1024*1024
  });
  return {value:JSON.parse(result.stdout),ms:performance.now()-begin};
}

/** @returns {Promise<void>} */
async function main(){
  const oldWindow=globalThis.window;
  const service=await startServer({token:'sco-application-cold-fixture-token-2026'});
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'sco-app-cold-'));
  try {
    const isolated=path.join(temp,'facade.mjs');
    await atomicWrite(isolated,await fs.readFile(path.join(ROOT,'sco-public',EXPOSED)));
    const nativeEntry=path.join(ROOT,'before','entry.mjs');
    const relayWorker=path.join(__dirname,'application-challenge-sco-relay-child.cjs');
    /** @type {Record<'heavy'|'light',{native:number[],remote:number[]}>} */
    const workloads={
      heavy:{native:[],remote:[]},
      light:{native:[],remote:[]}
    };
    for(const [name,count] of [['heavy',120000],['light',1]]){
      const size=/** @type {'heavy'|'light'} */(name);
      const cases=[
        [0x12345678,count],
        [0xffffffff,count],
        [0x9e3779b9,count]
      ];
      const baselineArgs=[nativeEntry,JSON.stringify(cases)];
      const remoteArgs=[relayWorker,isolated,service.origin,service.token,JSON.stringify(cases)];
      const baseline=await invoke(baselineArgs);
      const firstRemote=await invoke(remoteArgs);
      assert.deepEqual(firstRemote.value,baseline.value);
      for(let trial=0;trial<9;trial++){
        for(const kind of trial%2?['remote','native']:['native','remote']){
          const output=await invoke(kind==='native'?baselineArgs:remoteArgs);
          assert.deepEqual(output.value,baseline.value);
          workloads[size][/** @type {'native'|'remote'} */(kind)].push(output.ms);
        }
      }
    }
    process.stdout.write('APPLICATION_SCO_COLD_SESSION '+JSON.stringify({
      platform:process.platform,node:process.version,
      semanticsPreserved:true,
      samplesPerKind:9,
      measuredBoundary:'fresh Node child process launch through JSON output',
      heavy:{
        count:120000,
        nativeMs:median(workloads.heavy.native),
        remoteMs:median(workloads.heavy.remote),
        ratio:median(workloads.heavy.remote)/median(workloads.heavy.native),
        pairedMedianBound:pairedBudgetBound(workloads.heavy.native,workloads.heavy.remote),
        samples:workloads.heavy
      },
      light:{
        count:1,
        nativeMs:median(workloads.light.native),
        remoteMs:median(workloads.light.remote),
        ratio:median(workloads.light.remote)/median(workloads.light.native),
        pairedMedianBound:pairedBudgetBound(workloads.light.native,workloads.light.remote),
        samples:workloads.light
      },
      caveat:'Original private SCO server is already initialized; local HTTP only'
    })+'\n');
  }finally{
    await fs.rm(temp,{recursive:true,force:true});
    await new Promise((resolve,reject)=>service.server.close(
      error=>error?reject(error):resolve()));
    if(oldWindow===undefined)delete globalThis.window;
    else globalThis.window=oldWindow;
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
