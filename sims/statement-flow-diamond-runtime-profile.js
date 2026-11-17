'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {flattenStatementFlow}=require('../src/statement-flow');
const {pairedBudgetBound}=require('./paired-budget-bound');
const {makeProgram}=require('./statement-flow-attack-scaling');

/** @typedef {'native'|'ordinary'|'compact'} Variant */
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
  assert.equal(ordinary.functions,1);
  assert.equal(compact.functions,1);
  /** @type {Record<Variant,string>} */
  const texts={native:original,ordinary:ordinary.code,compact:compact.code};
  /** @type {Record<Variant,(value:number)=>number>} */
  const functions={native:load(original),
    ordinary:load(ordinary.code),compact:load(compact.code)};
  for(let x=-128;x<=128;x++){
    assert.equal(functions.ordinary(x),functions.native(x));
    assert.equal(functions.compact(x),functions.native(x));
  }
  /** @type {Variant[][]} */
  const orders=[
    ['native','ordinary','compact'],
    ['compact','native','ordinary'],
    ['ordinary','compact','native']
  ];
  const trials=9;
  const callsPerTrial=30000;
  const compileCountPerTrial=100;
  for(const f of Object.values(functions))exercise(f,80000);
  const expectedChecksum=exercise(functions.native,callsPerTrial);
  /** @type {Record<Variant,number[]>} */
  const hot={native:[],ordinary:[],compact:[]};
  /** @type {Record<Variant,number[]>} */
  const cold={native:[],ordinary:[],compact:[]};
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
    samples
  });
  return {
    platform:process.platform,node:process.version,branches:80,
    compilerBlocks:ordinary.blocks,sourceBytes:Buffer.byteLength(original),
    ordinaryBytes:Buffer.byteLength(ordinary.code),
    compactBytes:Buffer.byteLength(compact.code),
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
