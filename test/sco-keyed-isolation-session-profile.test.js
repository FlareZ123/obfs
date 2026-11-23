'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHmac} = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {createScoKeyedIsolation} = require('../src/rpc-keyed-isolation.js');

/** @typedef {'direct' | 'direct-control' | 'uncapped' | 'capped'} Variant */
/** @typedef {{name:string,calls:number,rounds:number,payloadBytes:number}} Workload */
/** @typedef {{trial:number,variant:Variant,wallMs:number,cpuMs:number,checksum:number}} Observation */
/** @typedef {{name:string,observations:Observation[],summary:{
 *   uncappedCpuRatioMedian:number,cappedCpuRatioMedian:number,
 *   placeboCpuRatioMedian:number,placeboCpuBreaches:number,
 *   cappedVsUncappedMedian:number,cappedCpuBreaches:number,
 *   cappedWallRatioMedian:number,cappedWallBreaches:number,
 *   rawCappedCpuRatios:number[],rawCappedWallRatios:number[],
 *   rawPlaceboCpuRatios:number[]
 * }}} WorkloadResult */

const KEY = Buffer.from('72657365617263682d7374726963742d746573742d6b6579', 'hex');
/** @type {Variant[]} */
const VARIANTS = ['direct', 'direct-control', 'uncapped', 'capped'];
/** @type {Workload[]} */
const WORKLOADS = [
  {name:'tiny-hmac-per-call',calls:65536,rounds:1,payloadBytes:64},
  {name:'substantial-hmac-per-call',calls:128,rounds:128,payloadBytes:16384}
];

/**
 * @param {number[]} values
 * @returns {number}
 */
function median(values) {
  assert.ok(values.length>0);
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:
    (sorted[middle-1]+sorted[middle])/2;
}

/**
 * Run one complete repeated-use session with pre-created server-side isolation.
 * This excludes isolate initialization and includes every per-call resolver,
 * queue, async function and HMAC cost. No HTTP, TLS or browser work is claimed.
 *
 * @param {Workload} workload
 * @param {Variant} variant
 * @param {number} trial
 * @returns {Promise<Observation>}
 */
async function runTrial(workload,variant,trial) {
  const request=/** @type {import('node:http').IncomingMessage} */(
    /** @type {unknown} */ ({headers:{authorization:'trusted-fixture'}}));
  const isolation=(variant==='direct'||variant==='direct-control')?null:createScoKeyedIsolation(
    ()=> 'trusted-principal',
    variant==='capped'?{maxPendingPerPrincipal:8,maxPendingTotal:32}:{}
  );
  const payload=Buffer.alloc(workload.payloadBytes,0x5a);
  let checksum=0;
  const cpuBefore=process.cpuUsage();
  const wallBefore=performance.now();
  for(let index=0;index<workload.calls;index++) {
    // Vary the actual authenticated work per call. Both wrappers see exactly
    // the same byte sequence and final accumulator, independently of order.
    payload.writeUInt32LE(index,0);
    const execute=async()=>{
      let current=0x811c9dc5;
      for(let round=0;round<workload.rounds;round++) {
        const digest=createHmac('sha256',KEY).update(payload).digest();
        current=Math.imul(current^digest.readUInt32LE(0)^round,16777619)>>>0;
      }
      checksum=Math.imul(checksum^current,16777619)>>>0;
    };
    if(isolation) await isolation(request,execute);
    else await execute();
  }
  const wallMs=performance.now()-wallBefore;
  const cpu=process.cpuUsage(cpuBefore);
  const cpuMs=(cpu.user+cpu.system)/1000;
  assert.ok(wallMs>0,'Measured work must use positive wall time');
  // Windows CPU accounting may round a short 16-call warmup to zero.
  // Only long actual paired trials require a positive CPU denominator.
  if(trial>=0)assert.ok(cpuMs>0,'Measured paired work must use positive CPU time');
  return {trial,variant,wallMs,cpuMs,checksum};
}

/**
 * @param {Workload} workload
 * @param {number} trials
 * @returns {Promise<WorkloadResult>}
 */
async function profileWorkload(workload,trials) {
  // Each path is explicitly warmed before measurement. Do not deduct repeated
  // per-operation work under the initialization exception.
  for(const variant of VARIANTS) {
    await runTrial({...workload,calls:Math.min(workload.calls,16)},variant,-1);
  }
  /** @type {Observation[]} */
  const observations=[];
  for(let trial=0;trial<trials;trial++){
    // With 12 trials, every arm occurs at each order rank three times.
    const order=VARIANTS.slice(trial%VARIANTS.length).concat(
      VARIANTS.slice(0,trial%VARIANTS.length));
    /** @type {Observation[]} */
    const paired=[];
    for(const variant of order) {
      const measurement=await runTrial(workload,variant,trial);
      paired.push(measurement);
      observations.push(measurement);
    }
    const checksums=new Set(paired.map(entry=>entry.checksum));
    assert.equal(checksums.size,1,'Trial '+trial+' must preserve exact protected HMAC results');
  }
  /** @param {Variant} variant @returns {Observation[]} */
  const arm=(variant)=>observations.filter(x=>x.variant===variant)
    .sort((a,b)=>a.trial-b.trial);
  const direct=arm('direct'),placebo=arm('direct-control'),
    uncapped=arm('uncapped'),capped=arm('capped');
  const cappedCpu=capped.map((entry,i)=>entry.cpuMs/direct[i].cpuMs);
  const cappedWall=capped.map((entry,i)=>entry.wallMs/direct[i].wallMs);
  const uncappedCpu=uncapped.map((entry,i)=>entry.cpuMs/direct[i].cpuMs);
  const placeboCpu=placebo.map((entry,i)=>entry.cpuMs/direct[i].cpuMs);
  const capVsUncapped=capped.map((entry,i)=>entry.cpuMs/uncapped[i].cpuMs);
  return {name:workload.name,observations,summary:{
    uncappedCpuRatioMedian:median(uncappedCpu),
    cappedCpuRatioMedian:median(cappedCpu),
    placeboCpuRatioMedian:median(placeboCpu),
    placeboCpuBreaches:placeboCpu.filter(value=>value>2.5).length,
    cappedVsUncappedMedian:median(capVsUncapped),
    cappedCpuBreaches:cappedCpu.filter(value=>value>2.5).length,
    cappedWallRatioMedian:median(cappedWall),
    cappedWallBreaches:cappedWall.filter(value=>value>2.5).length,
    rawCappedCpuRatios:cappedCpu,
    rawCappedWallRatios:cappedWall,
    rawPlaceboCpuRatios:placeboCpu
  }};
}

test('bounded SCO keyed isolation preserves repeated-use HMAC and profiles compute overhead', {
  timeout:240000
}, async()=>{
  /** @type {WorkloadResult[]} */
  const results=[];
  for(const workload of WORKLOADS) {
    results.push(await profileWorkload(workload,12));
  }
  // These measurements are intentionally observations, not a passing 2.5x
  // budget certificate. Every strict breach stays in the machine-readable log.
  console.log('SCO_KEYED_ISOLATION_SESSION_PROFILE='+JSON.stringify({
    node:process.version,platform:process.platform,arch:process.arch,
    trialCount:12,results
  }));
  assert.equal(results.length,2);
  assert.ok(results.every(result=>result.observations.length===48));
});
