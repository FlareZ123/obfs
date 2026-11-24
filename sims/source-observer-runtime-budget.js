'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src/core');

const SAMPLE_COUNT=31;
const WARMUP_COUNT=6;
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
    lines.push(`const payload${suffix} = 'payload-value-${suffix}-with-enough-characters';`);
    lines.push(`export const payloadText${suffix} = payload${suffix};`);
  }
  return lines.join('\n');
}

/** @param {string} code @param {string} workload @param {string} side @param {number} index @returns {string} */
function dataUrl(code,workload,side,index) {
  return 'data:text/javascript;base64,'+Buffer.from(code,'utf8').toString('base64')+
    '#'+workload+'-'+side+'-'+index;
}

/**
 * Measure one ESM module evaluation, including the non-exempt COO startup cost.
 * @param {string} code
 * @param {string} workload
 * @param {string} side
 * @param {number} index
 * @returns {Promise<{elapsedMs:number,exports:Record<string,unknown>}>}
 */
async function importOnce(code,workload,side,index) {
  const url=dataUrl(code,workload,side,index);
  const start=performance.now();
  const namespace=await import(url);
  return {elapsedMs:performance.now()-start,exports:namespace};
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
      'Fresh Node ESM module realm with unmodified Function.prototype.toString, Function.prototype.call, and String.fromCharCode before module evaluation.'
  };
  const result=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',
    seed:'source-observer-runtime-budget-v1',
    strings:true,
    experimentalSourceObservationPlan:hostContract
  });
  const emitted=result.files[0];
  assert.ok(emitted&&typeof emitted.code==='string',workload+' emitted module missing');
  assert.ok(emitted.metrics.properties>=1,workload+' property transform missing');
  assert.ok(emitted.metrics.bindings>=1,workload+' binding transform missing');
  assert.ok(emitted.metrics.literals>=1,workload+' string transform missing');
  assert.ok(emitted.code.includes('function observed() { return 29; }'),
    workload+' changed the observed callable source');

  const verify=(baseline,transformed)=>{
    assert.deepEqual(transformed.exports,baseline.exports,
      workload+' exported module values differ');
  };
  for(let index=0;index<WARMUP_COUNT;index++) {
    const baseline=await importOnce(source,workload,'native-warmup',index);
    const transformed=await importOnce(emitted.code,workload,'obfuscated-warmup',index);
    verify(baseline,transformed);
  }

  const baselineSamples=[];
  const obfuscatedSamples=[];
  for(let index=0;index<SAMPLE_COUNT;index++) {
    let baseline,transformed;
    if(index%2===0) {
      baseline=await importOnce(source,workload,'native-sample',index);
      transformed=await importOnce(emitted.code,workload,'obfuscated-sample',index);
    } else {
      transformed=await importOnce(emitted.code,workload,'obfuscated-sample',index);
      baseline=await importOnce(source,workload,'native-sample',index);
    }
    verify(baseline,transformed);
    baselineSamples.push(baseline.elapsedMs);
    obfuscatedSamples.push(transformed.elapsedMs);
  }
  const baselineMedianMs=median(baselineSamples);
  const obfuscatedMedianMs=median(obfuscatedSamples);
  const ratio=obfuscatedMedianMs/baselineMedianMs;
  return {
    workload,
    extraStrings,
    sourceBytes:Buffer.byteLength(source),
    emittedBytes:Buffer.byteLength(emitted.code),
    sourceSha256:sha256(source),
    emittedSha256:sha256(emitted.code),
    sampleCount:SAMPLE_COUNT,
    warmupCount:WARMUP_COUNT,
    baselineSamplesMs:baselineSamples,
    obfuscatedSamplesMs:obfuscatedSamples,
    baselineMedianMs,
    obfuscatedMedianMs,
    ratio,
    budgetRatio:BUDGET_RATIO,
    passesBudget:ratio<=BUDGET_RATIO,
    metrics:emitted.metrics
  };
}

async function main() {
  const smallSource=makeSource(0);
  const mediumSource=makeSource(32);
  const small=await measureWorkload(smallSource,'small-one-literal',0);
  const medium=await measureWorkload(mediumSource,'medium-32-literals',32);
  const report={
    node:process.version,
    platform:process.platform,
    architecture:process.arch,
    budgetRule:'COO initialization is not exempt; median module-evaluation ratio must be <= 2.5x',
    workloads:[small,medium]
  };
  process.stdout.write('SOURCE_OBSERVER_RUNTIME_BUDGET '+JSON.stringify(report)+'\n');
  assert.ok(small.passesBudget,'small source-observer workload exceeds 2.5x COO budget');
  assert.ok(medium.passesBudget,'medium source-observer workload exceeds 2.5x COO budget');
  return report;
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
module.exports={main,makeSource,measureWorkload};
