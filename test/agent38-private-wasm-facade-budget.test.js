'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src/core');
const {pairedBudgetBound}=require('../sims/paired-budget-bound');

const source='"use strict";'+
  'function secretI32(x){return (((x^137)&(x>>>3))|(x<<7));}'+
  'function published(x){return secretI32(x);}module.exports=published;';

/** @param {string} code @returns {(x:number)=>number} */
function load(code){
  const sandbox={module:{exports:null},globalThis};
  vm.runInNewContext(code,sandbox,{timeout:2500});
  return /** @type {(x:number)=>number} */(/** @type {unknown} */(sandbox.module.exports));
}

/** @param {(x:number)=>number} fn @param {number} count @returns {number} */
function work(fn,count){
  let checksum=0;
  for(let i=0;i<count;i++)
    checksum=(checksum^fn((i*1664525)|0))|0;
  return checksum;
}

/** @param {number[]} values @returns {number} */
function maximum(values){return Math.max(...values);}

/** @param {(x:number)=>number} fn @param {number} n @returns {number} */
function timed(fn,n){
  const started=performance.now();
  const checksum=work(fn,n);
  const elapsed=performance.now()-started;
  assert.ok(Number.isFinite(elapsed)&&elapsed>0);
  assert.equal(typeof checksum,'number');
  return elapsed;
}

test('paired hot and first-use observations of a private Wasm helper facade',()=>{
  /** @type {unknown[]} */
  const report=[];
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    const out=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'agent38-wasm-private-facade-profile/'+mode,
      identifiers:false,properties:false,strings:false,
      experimentalWasmI32:{'entry.cjs':['secretI32']}
    }).files[0];
    assert.equal(out.metrics.wasmI32Functions,1);
    const native=load(source);
    const virtualized=load(String(out.code));
    assert.equal(Function.prototype.toString.call(native),
      Function.prototype.toString.call(virtualized));
    const iterations=400000;
    const expected=work(native,iterations);
    assert.equal(work(virtualized,iterations),expected);
    for(let i=0;i<6;i++){
      assert.equal(work(native,iterations),expected);
      assert.equal(work(virtualized,iterations),expected);
    }
    /** @type {number[]} */
    const nativeHot=[];
    /** @type {number[]} */
    const encodedHot=[];
    for(let i=0;i<13;i++){
      const pairs=i%2===0?[[native,nativeHot],[virtualized,encodedHot]]:
        [[virtualized,encodedHot],[native,nativeHot]];
      for(const [fn,times] of /** @type {[typeof native,number[]][]} */(pairs)){
        const started=performance.now();
        assert.equal(work(fn,iterations),expected);
        times.push(performance.now()-started);
      }
    }
    const hot=pairedBudgetBound(nativeHot,encodedHot);
    /** @type {number[]} */
    const nativeFirst=[];
    /** @type {number[]} */
    const encodedFirst=[];
    for(let trial=0;trial<13;trial++){
      const pairs=trial%2===0?
        [[source,nativeFirst],[String(out.code),encodedFirst]]:
        [[String(out.code),encodedFirst],[source,nativeFirst]];
      for(const [code,times] of /** @type {[string,number[]][]} */(pairs)){
        const started=performance.now();
        const fn=load(code);
        assert.equal(fn(42),native(42));
        times.push(performance.now()-started);
      }
    }
    const firstUse=pairedBudgetBound(nativeFirst,encodedFirst);
    report.push({mode,iterations,trialPairs:13,pairedOrderCounterbalanced:true,
      hot,firstUse,
      hotStrictBreaches:hot.samplePairs-hot.observedPairsWithinBudget,
      firstUseStrictBreaches:firstUse.samplePairs-firstUse.observedPairsWithinBudget,
      maxHotPairRatio:maximum(encodedHot.map((v,i)=>v/nativeHot[i])),
      maxFirstUsePairRatio:maximum(encodedFirst.map((v,i)=>v/nativeFirst[i])),
      sessionInitializationDeductible:mode==='sno',
      nativeHot,encodedHot,nativeFirst,encodedFirst});
  }
  console.log('PROFILE_WASM_PRIVATE_SOURCE_FACADE '+JSON.stringify(report));
});
