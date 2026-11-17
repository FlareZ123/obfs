'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {flattenStatementFlow}=require('../src/statement-flow');
const {recoverStatementFlow}=require('../sims/statement-flow-recover');

/** @param {string} source @returns {(x:number)=>number} */
function load(source){
  return /** @type {(x:number)=>number} */ (vm.runInNewContext(source+'\n;f;'));
}

/**
 * A linear-length source with a chain of independently joined diamonds.
 * A naive recursive decompiler duplicates the entire remaining suffix at
 * each diamond and emits exponentially many copies of the final return.
 * @param {number} count
 * @returns {string}
 */
function sequentialDiamonds(count){
  const lines=['function f(x){var y=x|0;'];
  for(let i=0;i<count;i++){
    const mask=1<<(i%5);
    lines.push('if((y&'+mask+')!==0){y=(y+'+(i+1)+')|0;}else{y=(y-'+(i+3)+')|0;}');
  }
  lines.push('return y|0;}');
  return lines.join('\n');
}

test('seedless CFG recovery shares sequential branch joins without exponential output',()=>{
  const original=sequentialDiamonds(12);
  const native=load(original);
  for(const compactCases of [false,true]){
    for(let seed=0;seed<8;seed++){
      const generated=flattenStatementFlow(original,'commonjs',{
        seed:'linear-recovery-'+seed,names:['f'],compactCases
      });
      assert.equal(generated.functions,1,'Selected function declined');
      const recovered=recoverStatementFlow(generated.code,'f');
      assert.ok(recovered.blocks>=12,'Did not recover the branch graph');
      assert.ok(recovered.code.length<original.length*12,
        'Recovered source duplicated shared branch suffixes: '+recovered.code.length);
      const actual=load(generated.code);
      const clone=load(recovered.code);
      for(let x=-65;x<=65;x+=3){
        assert.equal(actual(x),native(x),'Compiler mismatch at '+x);
        assert.equal(clone(x),native(x),'Static reconstruction mismatch at '+x);
      }
    }
  }
});

test('seedless recovery keeps early exits and mixed branch joins native',()=>{
  const source='function f(x){var a=x|0;'+
    'if(a>10){if(a>30)return a+1;a*=2;}else{a-=3;}'+
    'if((a&1)!==0){a^=7;}else{a+=9;}'+
    'if(a<0)return -a;return a|0;}';
  const native=load(source);
  for(const compactCases of [false,true]){
    for(let i=0;i<8;i++){
      const generated=flattenStatementFlow(source,'commonjs',{
        seed:'early-join-'+i,names:['f'],compactCases
      });
      assert.equal(generated.functions,1);
      const recovered=recoverStatementFlow(generated.code,'f');
      const actual=load(generated.code),clone=load(recovered.code);
      for(let x=-70;x<=70;x++){
        assert.equal(actual(x),native(x),'Compiler mismatch at '+x);
        assert.equal(clone(x),native(x),'Recovered early-exit mismatch at '+x);
      }
    }
  }
});
