'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {createScoKeyedIsolation}=require('../src/rpc-keyed-isolation');

/**
 * Deterministic CPU-bound stand-in for one server-resident operation.
 * Every result feeds an observable digest, preventing loop elision.
 * @param {number} rounds
 * @param {number} input
 * @returns {number}
 */
function compute(rounds,input) {
  let result=(input+0x9e3779b9)|0;
  for(let i=0;i<rounds;i++) {
    result=(Math.imul(result^i,1664525)+1013904223)|0;
  }
  return result;
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const ordered=values.slice().sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/**
 * Exactly the same asynchronous protected-operation callback executes in both
 * cases. The isolated case additionally performs verified-principal lookup,
 * global-cap admission, a one-element FIFO and accounting cleanup.
 * @param {{calls:number,rounds:number}} profile
 * @param {boolean} useIsolation
 * @returns {Promise<{durationMs:number,digest:number}>}
 */
async function measure(profile,useIsolation) {
  /** @type {import('node:http').IncomingMessage} */
  const request=/** @type {import('node:http').IncomingMessage} */ (/** @type {unknown} */ ({}));
  const isolate=createScoKeyedIsolation(()=> 'verified-account',{
    maxPendingPerPrincipal:1,maxPendingTotal:1
  });
  let digest=0;
  const started=performance.now();
  for(let input=0;input<profile.calls;input++) {
    const execute=async()=>{digest^=compute(profile.rounds,input);};
    if(useIsolation)await isolate(request,execute);
    else await execute();
  }
  return {durationMs:performance.now()-started,digest};
}

/**
 * Alternating order and matching result digests reduce JIT/order confounds.
 * The reported values are finite samples of one chosen synchronous CPU loop.
 * @param {{name:string,calls:number,rounds:number}} profile
 * @param {number} trials
 * @returns {Promise<{name:string,calls:number,rounds:number,nativeMs:number,isolatedMs:number,ratio:number,trialRatios:number[],digest:number}>}
 */
async function profileBudget(profile,trials=9) {
  if(!Number.isSafeInteger(trials)||trials<3||trials%2===0) {
    throw new TypeError('trials must be an odd integer >= 3');
  }
  // Warm up both variants without using warmup timings in the result.
  for(let k=0;k<3;k++) {
    await measure({calls:Math.min(profile.calls,512),rounds:profile.rounds},false);
    await measure({calls:Math.min(profile.calls,512),rounds:profile.rounds},true);
  }
  /** @type {number[]} */
  const native=[];
  /** @type {number[]} */
  const isolated=[];
  /** @type {number[]} */
  const ratios=[];
  let lastDigest=0;
  for(let trial=0;trial<trials;trial++) {
    const directFirst=trial%2===0;
    const first=await measure(profile,!directFirst);
    const second=await measure(profile,directFirst);
    const a=directFirst?first:second;
    const b=directFirst?second:first;
    assert.equal(b.digest,a.digest,'Isolation changed an operation result');
    lastDigest=a.digest;
    native.push(a.durationMs);
    isolated.push(b.durationMs);
    ratios.push(b.durationMs/a.durationMs);
  }
  return {name:profile.name,calls:profile.calls,rounds:profile.rounds,
    nativeMs:median(native),isolatedMs:median(isolated),
    ratio:median(isolated)/median(native),trialRatios:ratios,digest:lastDigest};
}

/** @returns {Promise<Awaited<ReturnType<typeof profileBudget>>[]>} */
async function run() {
  const fixtures=[
    {name:'empty-async-operation',calls:30000,rounds:0},
    {name:'light-integer-work',calls:12000,rounds:64},
    {name:'medium-integer-work',calls:4000,rounds:1024},
    {name:'heavy-integer-work',calls:700,rounds:16384}
  ];
  /** @type {Awaited<ReturnType<typeof profileBudget>>[]} */
  const rows=[];
  for(const fixture of fixtures)rows.push(await profileBudget(fixture));
  return rows;
}

if(require.main===module) {
  run().then(rows=>{
    console.log(JSON.stringify({
      node:process.version,
      platform:process.platform,
      cpuBenchmark:'server-private sequential authenticated calls',
      samplePolicy:'9 alternating paired samples, 3 warmup repetitions',
      rows
    }));
  }).catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={compute,median,measure,profileBudget,run};
