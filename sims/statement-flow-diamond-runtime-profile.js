'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {flattenStatementFlow}=require('../src/statement-flow');
const {pairedBudgetBound}=require('./paired-budget-bound');
const {makeProgram}=require('./statement-flow-attack-scaling');
const {recoverStatementFlow}=require('./statement-flow-recover');

/** @typedef {'native'|'ordinary'|'compact'|'dense'} Variant */
/** @param {string} source @returns {(value:number)=>number} */
function load(source){
  return /** @type {(value:number)=>number} */ (vm.runInNewContext(source+'\n;f;'));
}

/** @param {(value:number)=>number} f @param {number} loops @returns {number} */
function exercise(f,loops){
  let checksum=0;
  for(let i=0;i<loops;i++)checksum=(checksum^f((i*7-139)|0))|0;
  return checksum;
}
/** @param {string} source @param {number} unique @returns {void} */
function compile(source,unique){
  const script=new vm.Script(source+'\n// per-compilation-'+unique,{
    filename:'obfs-cold-'+unique+'.cjs'
  });
  assert.ok(script);
}

/**
 * Independent median paired timing diagnostics. Compile-time omits file I/O
 * and module loading, and hot runtime omits compilation. Neither is an end-
 * to-end 2.5x proof. Retain every sample rather than a bare ratio.
 * @returns {object}
 */
function run(){
  const original=makeProgram(80);
  const ordinary=flattenStatementFlow(original,'commonjs',{
    seed:'diamond-budget-80',names:['f']
  });
  const compact=flattenStatementFlow(original,'commonjs',{
    seed:'diamond-budget-80',names:['f'],compactCases:true
  });
  const dense=flattenStatementFlow(original,'commonjs',{
    seed:'diamond-budget-80',names:['f'],compactCases:true,denseStateIds:true
  });
  for(const candidate of [ordinary,compact,dense])assert.equal(candidate.functions,1);
  /** @type {Record<Variant,string>} */
  const texts={native:original,ordinary:ordinary.code,
    compact:compact.code,dense:dense.code};
  /** @type {Record<Variant,(value:number)=>number>} */
  const functions={native:load(original),
    ordinary:load(ordinary.code),compact:load(compact.code),dense:load(dense.code)};
  const decompileStart=performance.now();
  const recoveredDense=recoverStatementFlow(dense.code,'f');
  const denseExtractionMs=performance.now()-decompileStart;
  const clonedDense=load(recoveredDense.code);
  for(let x=-128;x<=128;x++){
    const native=functions.native(x);
    for(const candidate of ['ordinary','compact','dense']){
      assert.equal(functions[/** @type {Variant} */ (candidate)](x),native);
    }
    assert.equal(clonedDense(x),native);
  }
  /** @type {Variant[][]} */
  const orders=[
    ['native','ordinary','compact','dense'],
    ['dense','compact','ordinary','native'],
    ['compact','native','dense','ordinary'],
    ['ordinary','dense','native','compact']
  ];
  const trials=12;
  const callsPerTrial=30000;
  const compileCountPerTrial=100;
  for(const f of Object.values(functions))exercise(f,80000);
  const expectedChecksum=exercise(functions.native,callsPerTrial);
  /** @type {Record<Variant,number[]>} */
  const hot={native:[],ordinary:[],compact:[],dense:[]};
  /** @type {Record<Variant,number[]>} */
  const cold={native:[],ordinary:[],compact:[],dense:[]};
  for(let trial=0;trial<trials;trial++){
    for(const name of orders[trial%orders.length]){
      const start=performance.now();
      const checksum=exercise(functions[name],callsPerTrial);
      const ms=performance.now()-start;
      assert.equal(checksum,expectedChecksum);
      assert.ok(ms>0);
      hot[name].push(ms);
    }
  }
  let unique=0;
  for(let trial=0;trial<trials;trial++){
    for(const name of orders[trial%orders.length]){
      const start=performance.now();
      for(let i=0;i<compileCountPerTrial;i++){
        compile(texts[name],unique++);
      }
      const ms=performance.now()-start;
      assert.ok(ms>0);
      cold[name].push(ms);
    }
  }
  /** @param {Record<Variant,number[]>} samples */
  const summaries=samples=>({
    ordinaryVsNative:pairedBudgetBound(samples.native,samples.ordinary),
    compactVsNative:pairedBudgetBound(samples.native,samples.compact),
    compactVsOrdinary:pairedBudgetBound(samples.ordinary,samples.compact),
    denseVsNative:pairedBudgetBound(samples.native,samples.dense),
    denseVsCompact:pairedBudgetBound(samples.compact,samples.dense),
    samples
  });
  return {
    platform:process.platform,node:process.version,branches:80,
    compilerBlocks:ordinary.blocks,sourceBytes:Buffer.byteLength(original),
    ordinaryBytes:Buffer.byteLength(ordinary.code),
    compactBytes:Buffer.byteLength(compact.code),
    denseBytes:Buffer.byteLength(dense.code),
    sourceOnlyDenseCloneBytes:Buffer.byteLength(recoveredDense.code),
    sourceOnlyDenseCloneMs:denseExtractionMs,
    heldoutChecks:257,
    hotBoundary:'30,000 warmed function calls per trial; excludes parsing, modules and startup',
    coldBoundary:'100 unique vm.Script compilations per trial; excludes module import, disk I/O and execution',
    trials,hot:summaries(hot),cold:summaries(cold)
  };
}

if(require.main===module)process.stdout.write(
  'CFG_DIAMOND_BUDGET '+JSON.stringify(run())+'\n'
);
module.exports={run};
