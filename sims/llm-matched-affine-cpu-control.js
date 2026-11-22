'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {atomicWrite}=require('../src/atomic');
const {pairedBudgetBound}=require('./paired-budget-bound');
const {createMatchedBlindAffineChallenge}=require('./llm-matched-affine-challenge');

const names=Object.freeze(['round1','round2','round3']);
// Windows process.cpuUsage can report sub-16ms intervals as zero; a
// >100ms native measurement makes per-pair CPU quantization tolerable.
const population=Object.freeze([8_000_000,13]);

/** @typedef {'native'|'generated'|'esbuild-minified'} Variant */
/** @typedef {Record<string,(input:number)=>number>} NumericExports */
/** @typedef {{cpuMs:number,wallMs:number,checksum:number}} TimedWork */
/** @typedef {{cpuMs:number[],wallMs:number[]}} Samples */

/** @param {string} source @returns {Promise<NumericExports>} */
async function sourceModule(source){
  return /** @type {NumericExports} */ (
    await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source))
  );
}

/**
 * Three independently selected named exported functions are actually called
 * on deterministic changing inputs, with cumulative output mixing to block
 * trivially dead or side-effect-free work elimination. This is a specialized
 * hot-leaf workload; it does not model full application I/O.
 *
 * @param {NumericExports} functions
 * @param {number} callsPerExport
 * @returns {number}
 */
function exercise(functions,callsPerExport){
  let checksum=0;
  for(const name of names){
    const fn=functions[name];
    let input=0x43af78cd;
    for(let i=0;i<callsPerExport;i++){
      input=(Math.imul(input,1664525)+1013904223)|0;
      checksum=(Math.imul(checksum,33)^fn(input))|0;
    }
  }
  return checksum;
}

/**
 * Measure real application CPU after module import and source compilation.
 * COO is not allowed to deduct initialization for release; the post-init
 * result is therefore only a necessary diagnostic, never a full COO pass.
 *
 * @param {NumericExports} functions
 * @param {number} callsPerExport
 * @returns {TimedWork}
 */
function measure(functions,callsPerExport){
  const cpuStart=process.cpuUsage();
  const wallStart=performance.now();
  const checksum=exercise(functions,callsPerExport);
  const wallMs=performance.now()-wallStart;
  const delta=process.cpuUsage(cpuStart);
  return {cpuMs:(delta.user+delta.system)/1000,wallMs,checksum};
}

/**
 * Source-matched, randomized-private, pair-alternated post-init CPU control
 * against ordinary minification. The generated text and minified text are
 * both produced by the real compiler from the same hidden source.
 *
 * @param {'coo'|'sno'} mode
 * @returns {Promise<object>}
 */
async function runMode(mode){
  const trial=createMatchedBlindAffineChallenge(mode);
  const exposed=await Promise.all(trial.questions.map(x=>sourceModule(x.source)));
  const guesses=exposed.map(functions=>
    Object.fromEntries(names.map(name=>[name,functions[name](0)]))
  );
  assert.ok(trial.verify(guesses).every(result=>result.passed));
  const revealed=trial.reveal();
  const original=await sourceModule(revealed.originalSource);
  const variants=/** @type {Record<Variant,NumericExports>} */({
    native:original,
    generated:exposed[revealed.arms.indexOf('generated')],
    'esbuild-minified':exposed[revealed.arms.indexOf('esbuild-minified')]
  });
  const [callsPerExport,rounds]=population;
  const expected=exercise(original,callsPerExport);
  for(const name of Object.keys(variants))
    assert.equal(exercise(variants[/** @type {Variant} */(name)],callsPerExport),expected,
      'Same-source generated and minifier outputs must match native checksum');

  // Pre-heat the individual wrapped code before timing, so the only claimed
  // boundary is repeated work after normal JS JIT and import initialization.
  for(let warm=0;warm<3;warm++){
    for(const kind of /** @type {Variant[]} */(
      ['native','generated','esbuild-minified']
    )) assert.equal(exercise(variants[kind],100_000),
      exercise(original,100_000),'Warmup changed outputs');
  }
  /** @type {Record<Variant,Samples>} */
  const samples={
    native:{cpuMs:[],wallMs:[]},
    generated:{cpuMs:[],wallMs:[]},
    'esbuild-minified':{cpuMs:[],wallMs:[]}
  };
  const orders=/** @type {Variant[][]} */([
    ['native','generated','esbuild-minified'],
    ['esbuild-minified','native','generated'],
    ['generated','esbuild-minified','native']
  ]);
  for(let round=0;round<rounds;round++){
    for(const variant of orders[round%orders.length]){
      const result=measure(variants[variant],callsPerExport);
      assert.equal(result.checksum,expected,mode+'/'+round+'/'+variant);
      assert.ok(result.cpuMs>0&&result.wallMs>0);
      samples[variant].cpuMs.push(result.cpuMs);
      samples[variant].wallMs.push(result.wallMs);
    }
  }
  const native=samples.native;
  const generated=samples.generated;
  const minified=samples['esbuild-minified'];
  const diagnostics={
    generatedVsNative:pairedBudgetBound(native.cpuMs,generated.cpuMs),
    minifiedVsNative:pairedBudgetBound(native.cpuMs,minified.cpuMs),
    generatedVsMinified:pairedBudgetBound(minified.cpuMs,generated.cpuMs),
    generatedVsNativeWall:pairedBudgetBound(native.wallMs,generated.wallMs),
    minifiedVsNativeWall:pairedBudgetBound(native.wallMs,minified.wallMs)
  };
  const strictCpuExceedances=generated.cpuMs.filter((value,index)=>
    value>2.5*native.cpuMs[index]).length;
  const evidence={
    mode,node:process.version,platform:process.platform,
    sourceCommitment:revealed.commitment,
    callsPerExport,protectedExportCount:names.length,rounds,
    sourceBytes:{
      native:Buffer.byteLength(revealed.originalSource),
      generated:Buffer.byteLength(trial.questions[revealed.arms.indexOf('generated')].source),
      minified:Buffer.byteLength(trial.questions[revealed.arms.indexOf('esbuild-minified')].source)
    },
    initializationExcluded:true,
    environmentBoundary:mode==='coo'?
      'Post-init COO hot-leaf lower-bound diagnostic, not full startup-inclusive COO budget':
      'Post-init SNO hot-leaf CPU with symmetric native JIT warmup',
    raw:samples,diagnostics,strictCpuExceedances,
    source: 'sims/llm-matched-affine-cpu-control.js',
    witness: 'Attacker and source code are revealed only after verifier commitment'
  };
  const folder=process.env.OBFS_AFFINE_CPU_RECEIPT_DIR;
  if(folder){
    await fs.mkdir(folder,{recursive:true});
    await atomicWrite(path.join(folder,mode+'-cpu.json'),JSON.stringify({
      evidence,questions:trial.questions,revealed
    },null,2)+'\n');
  }
  return evidence;
}

/** @returns {Promise<void>} */
async function main(){
  for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])){
    const observed=await runMode(mode);
    console.log('MATCHED_AFFINE_CPU '+JSON.stringify(observed));
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});

module.exports={runMode,measure,exercise};
