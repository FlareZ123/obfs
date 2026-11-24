'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src/core');
const {familywiseBudgetBounds}=require('./familywise-budget-bound');

const SAMPLE_COUNT=31;
const WARMUP_COUNT=6;
const IMPORTS_PER_BATCH=512;
const BUDGET_RATIO=2.5;

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @param {string} value @returns {string} */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {number} extraStrings @returns {string} */
function makeSource(extraStrings) {
  const lines=[
    '// UTF-16 coordinate prefix 😀',
    'const privateRecord = { privateField: 7 };',
    'function observed() { return 29; }',
    'const observedSource = Function.prototype.toString.call(observed);',
    "const label = 'safe-literal';",
    'export const result = privateRecord.privateField;',
    'export const sourceText = observedSource;',
    'export const labelText = label;'
  ];
  for(let index=0;index<extraStrings;index++) {
    const suffix=String(index).padStart(3,'0');
    lines.push("const payload"+suffix+" = 'payload-value-"+suffix+"-with-enough-characters';");
    lines.push('export const payloadText'+suffix+' = payload'+suffix+';');
  }
  return lines.join('\n');
}

/** @param {string} code @param {string} workload @param {string} side @param {number} index @returns {string} */
function dataUrl(code,workload,side,index) {
  return 'data:text/javascript;base64,'+Buffer.from(code,'utf8').toString('base64')+
    '#'+workload+'-'+side+'-'+index;
}

/**
 * Measure a batch of fresh ESM evaluations. URLs are prepared before timing;
 * threadCpuUsage measures main-thread CPU while performance.now is retained as
 * a separate elapsed-time diagnostic.
 * @param {string} code
 * @param {string} workload
 * @param {string} side
 * @param {number} index
 * @returns {Promise<{cpuMs:number,wallMs:number,exports:Record<string,unknown>}>}
 */
async function importBatch(code,workload,side,index) {
  const urls=Array.from({length:IMPORTS_PER_BATCH},(_,offset)=>
    dataUrl(code,workload,side,index*IMPORTS_PER_BATCH+offset));
  const cpuStart=process.threadCpuUsage();
  const wallStart=performance.now();
  let namespace;
  for(const url of urls) namespace=await import(url);
  const cpuDelta=process.threadCpuUsage(cpuStart);
  return {
    cpuMs:(cpuDelta.user+cpuDelta.system)/1000,
    wallMs:performance.now()-wallStart,
    exports:namespace
  };
}

/**
 * @param {string} source
 * @param {string} workload
 * @param {number} extraStrings
 * @returns {Promise<Object>}
 */
async function measureWorkload(source,workload,extraStrings) {
  const hostContract={
    runtimeFamily:'Node.js / V8',
    runtimeVersion:process.versions.node,
    contractVersion:'coo-direct-function-source-v1',
    pristineIntrinsicsPremise:
      'Fresh ESM module instance in the same unmodified Node realm, with unmodified Function.prototype.toString and Function.prototype.call.'
  };
  const result=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',
    seed:'source-observer-thread-cpu-budget-v1',
    strings:true,
    experimentalSourceObservationPlan:hostContract
  });
  const emitted=result.files[0];
  assert.ok(emitted&&typeof emitted.code==='string',workload+' emitted module missing');
  assert.ok(emitted.metrics.properties>=1,workload+' property transform missing');
  assert.ok(emitted.metrics.bindings>=1,workload+' binding transform missing');
  assert.equal(emitted.metrics.literals,0,
    workload+' must refuse the frame-shifting string decoder prologue');
  assert.ok(emitted.code.includes("'safe-literal'"),
    workload+' must retain the literal when the reader FramePosition would move');
  assert.ok(emitted.code.includes('function observed() { return 29; }'),
    workload+' changed the observed callable source');

  const verify=(baseline,transformed)=>{
    assert.deepEqual(transformed.exports,baseline.exports,
      workload+' exported module values differ');
  };
  for(let index=0;index<WARMUP_COUNT;index++) {
    const baseline=await importBatch(source,workload,'native-warmup',index);
    const transformed=await importBatch(emitted.code,workload,'candidate-warmup',index);
    verify(baseline,transformed);
  }

  const baselineCpuSamples=[];
  const candidateCpuSamples=[];
  const baselineWallSamples=[];
  const candidateWallSamples=[];
  for(let index=0;index<SAMPLE_COUNT;index++) {
    let baseline,candidate;
    if(index%2===0) {
      baseline=await importBatch(source,workload,'native-sample',index);
      candidate=await importBatch(emitted.code,workload,'candidate-sample',index);
    } else {
      candidate=await importBatch(emitted.code,workload,'candidate-sample',index);
      baseline=await importBatch(source,workload,'native-sample',index);
    }
    verify(baseline,candidate);
    baselineCpuSamples.push(baseline.cpuMs);
    candidateCpuSamples.push(candidate.cpuMs);
    baselineWallSamples.push(baseline.wallMs);
    candidateWallSamples.push(candidate.wallMs);
  }
  const cpuPairRatios=candidateCpuSamples.map((value,index)=>value/baselineCpuSamples[index]);
  const wallPairRatios=candidateWallSamples.map((value,index)=>value/baselineWallSamples[index]);
  const baselineCpuMedianMs=median(baselineCpuSamples);
  const candidateCpuMedianMs=median(candidateCpuSamples);
  const baselineWallMedianMs=median(baselineWallSamples);
  const candidateWallMedianMs=median(candidateWallSamples);
  const strictBreachSamples=cpuPairRatios
    .map((value,index)=>({sample:index,ratio:value}))
    .filter(sample=>sample.ratio>BUDGET_RATIO);
  const strictWallBreachSamples=wallPairRatios
    .map((value,index)=>({sample:index,ratio:value}))
    .filter(sample=>sample.ratio>BUDGET_RATIO);

  const placeboLeftCpuSamples=[];
  const placeboRightCpuSamples=[];
  const placeboLeftWallSamples=[];
  const placeboRightWallSamples=[];
  for(let index=0;index<SAMPLE_COUNT;index++) {
    let left,right;
    if(index%2===0) {
      left=await importBatch(source,workload,'placebo-left',index);
      right=await importBatch(source,workload,'placebo-right',index);
    } else {
      right=await importBatch(source,workload,'placebo-right',index);
      left=await importBatch(source,workload,'placebo-left',index);
    }
    verify(left,right);
    placeboLeftCpuSamples.push(left.cpuMs);
    placeboRightCpuSamples.push(right.cpuMs);
    placeboLeftWallSamples.push(left.wallMs);
    placeboRightWallSamples.push(right.wallMs);
  }
  const placeboCpuPairRatios=placeboRightCpuSamples.map((value,index)=>
    value/placeboLeftCpuSamples[index]);
  const placeboWallPairRatios=placeboRightWallSamples.map((value,index)=>
    value/placeboLeftWallSamples[index]);
  return {
    workload,
    extraStrings,
    sourceBytes:Buffer.byteLength(source),
    emittedBytes:Buffer.byteLength(emitted.code),
    sourceSha256:sha256(source),
    emittedSha256:sha256(emitted.code),
    sampleCount:SAMPLE_COUNT,
    warmupCount:WARMUP_COUNT,
    importsPerBatch:IMPORTS_PER_BATCH,
    baselineCpuSamplesMs:baselineCpuSamples,
    candidateCpuSamplesMs:candidateCpuSamples,
    cpuPairRatios,
    medianCpuPairRatio:median(cpuPairRatios),
    maxCpuPairRatio:Math.max(...cpuPairRatios),
    strictBreachCount:strictBreachSamples.length,
    strictBreachSamples,
    baselineCpuMedianMs,
    candidateCpuMedianMs,
    cpuRatioOfMedians:candidateCpuMedianMs/baselineCpuMedianMs,
    baselineWallSamplesMs:baselineWallSamples,
    candidateWallSamplesMs:candidateWallSamples,
    wallPairRatios,
    medianWallPairRatio:median(wallPairRatios),
    maxWallPairRatio:Math.max(...wallPairRatios),
    strictWallBreachCount:strictWallBreachSamples.length,
    strictWallBreachSamples,
    baselineWallMedianMs,
    candidateWallMedianMs,
    wallRatioOfMedians:candidateWallMedianMs/baselineWallMedianMs,
    placeboLeftCpuSamplesMs:placeboLeftCpuSamples,
    placeboRightCpuSamplesMs:placeboRightCpuSamples,
    placeboCpuPairRatios,
    placeboCpuMaxPairRatio:Math.max(...placeboCpuPairRatios),
    placeboCpuStrictBreachCount:placeboCpuPairRatios.filter(value=>value>BUDGET_RATIO).length,
    placeboLeftWallSamplesMs:placeboLeftWallSamples,
    placeboRightWallSamplesMs:placeboRightWallSamples,
    placeboWallPairRatios,
    placeboWallMaxPairRatio:Math.max(...placeboWallPairRatios),
    placeboWallStrictBreachCount:placeboWallPairRatios.filter(value=>value>BUDGET_RATIO).length,
    budgetRatio:BUDGET_RATIO,
    metrics:emitted.metrics
  };
}

async function main() {
  assert.equal(typeof process.threadCpuUsage,'function',
    'Node 22 threadCpuUsage is required for CPU evidence');
  const smallSource=makeSource(0);
  const mediumSource=makeSource(32);
  const small=await measureWorkload(smallSource,'small-observer-plan-no-string-decoder',0);
  const medium=await measureWorkload(mediumSource,'medium-observer-plan-32-retained-strings',32);
  const familywiseBudget=familywiseBudgetBounds([
    {native:small.baselineCpuSamplesMs,candidate:small.candidateCpuSamplesMs},
    {native:medium.baselineCpuSamplesMs,candidate:medium.candidateCpuSamplesMs}
  ],{threshold:BUDGET_RATIO,confidence:0.95});
  const report={
    node:process.version,
    platform:process.platform,
    architecture:process.arch,
    measurement:'process.threadCpuUsage main-thread CPU; performance.now elapsed wall time is diagnostic only',
    samplingDesign:'31 sequential alternating paired batches per workload, 512 fresh ESM imports per batch, in one Node process; within-workload independence and representativeness are not established',
    budgetRule:'COO initialization is not exempt. Every observed strict CPU pair above 2.5x vetoes the supported workload regardless of medians or confidence intervals. The familywise paired-median interval is a typical-runtime diagnostic, not a worst-case guarantee.',
    familywiseBudget,
    workloads:[small,medium]
  };
  fs.writeFileSync('source-observer-runtime-budget.json',JSON.stringify(report,null,2)+'\n');
  process.stdout.write('SOURCE_OBSERVER_RUNTIME_BUDGET '+JSON.stringify(report)+'\n');
  assert.equal(familywiseBudget.observedSampleHasOverBudgetPair,false,
    'any observed strict >2.5x CPU pair is a veto');
  assert.equal(familywiseBudget.verdict,'sample-supported',
    'the familywise paired-median CPU interval must support the 2.5x threshold; inconclusive is not a pass');
  return report;
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
module.exports={main,makeSource,measureWorkload};
