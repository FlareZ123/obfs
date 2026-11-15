'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {lowerImmediateFunction}=require('../workplace/experimental-vm-lower');
const {recoverImmediateVm}=require('../sims/vm-static-recover');

for(const [expression,expected] of [
  ['(((x+7)*3)^90)','(((x+7)*3)^90)'],
  ['(((x-12)<<3)>>>1)','(((x-12)<<3)>>>1)'],
  ['(((x&255)|16)^51)','(((x&255)|16)^51)']
]) {
  test('seedless source-only recovery of experimental VM: '+expression,()=>{
    const source='function calculate(x){return '+expression+';}module.exports=calculate;';
    for(const seed of ['first-high-entropy-looking-seed','completely-different-seed']) {
      const transformed=lowerImmediateFunction(source,'calculate',{
        sourceType:'commonjs',seed
      });
      assert.equal(transformed.transformed,true,transformed.reason);
      const attack=recoverImmediateVm(transformed.code,'calculate','commonjs');
      assert.equal(attack.expression,expected,'An attacker recovered a different formula');
      assert.equal(attack.bytecodeLength,transformed.bytecode.length);
      assert.equal(attack.operations,3);
    }
  });
}
