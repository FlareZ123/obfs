'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src/core');

/** @typedef {'coo'|'sco'|'sno'} Mode */

/**
 * Compare actual steady-state arithmetic with and without two private-field
 * spelling rewrites. Every sample executes exactly the same control flow and
 * counts the same arithmetic operations; the unmodified harness supplies
 * monotonic time. This finite microbenchmark is not a proof of universal
 * performance compliance for arbitrary programs or hosts.
 */
const source=[
  'const owner={privateKey:17,otherKey:5};',
  'const alias=(0,owner);',
  'function work(n){let sum=0;',
  'for(let i=0;i<n;i++)sum+=alias.privateKey+alias.otherKey+i%7;',
  'return sum;}',
  'work(500000);',
  'const start=clock.now();',
  'let total=0;',
  'for(let j=0;j<6;j++)total+=work(2000000);',
  'module.exports={sum:total,ms:clock.now()-start};'
].join('');

/** @param {string} code @returns {{sum:number,ms:number}} */
function measure(code){
  /** @type {{exports:unknown}} */
  const module={exports:null};
  const context={module,clock:{now:()=>performance.now()}};
  vm.runInNewContext(code,context,{timeout:45000});
  return /** @type {{sum:number,ms:number}} */(module.exports);
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

test('steady-state inert-comma private key rewriting remains within sampled 2.5x budget',()=>{
  const expected=measure(source);
  assert.ok(expected.ms>0&&Number.isFinite(expected.ms));
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const emitted=obfuscateFiles([{path:'private-hot-loop.cjs',
      sourceType:'commonjs',code:source}],{
      mode,seed:'performance-inert-owner/'+mode,
      properties:true,identifiers:false,strings:false
    }).files[0];
    assert.equal(emitted.metrics.properties,2,
      mode+' must actually rewrite both hot-path private record fields');
    const ratios=[];
    for(let trial=0;trial<7;trial++){
      const pair=trial%2===0?
        [source,String(emitted.code)]:[String(emitted.code),source];
      const measures=pair.map(measure);
      const native=trial%2===0?measures[0]:measures[1];
      const protectedRun=trial%2===0?measures[1]:measures[0];
      assert.equal(protectedRun.sum,native.sum,mode+' hot loop exact sum');
      assert.ok(native.ms>0&&protectedRun.ms>0);
      ratios.push(protectedRun.ms/native.ms);
    }
    const m=median(ratios);
    assert.ok(m<=2.5,
      mode+' 7-pair median slowdown '+m.toFixed(3)+
      ' exceeds sampled 2.5x budget; ratios='+JSON.stringify(ratios));
  }
});
