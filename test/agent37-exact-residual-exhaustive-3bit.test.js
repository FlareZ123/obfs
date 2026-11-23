'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {invertBoundedDegree}=
  require('../sims/two-sided-affine-degree-inversion');

test('every three-bit permutation inverts exactly with a bounded residual fallback',()=>{
  const values=Array.from({length:8},(_,i)=>i);
  let permutations=0,targets=0,exactFallbacks=0,uniqueOracleCalls=0;

  /**
   * Enumerate all 8! permutations in deterministic lexical-swap order.
   * Each output coordinate is balanced and therefore has zero cubic
   * coefficient; a degree-two certificate suffices for every permutation.
   * @param {number} fixed
   * @returns {void}
   */
  function enumerate(fixed){
    if(fixed===values.length){
      permutations++;
      /** @param {number} input @returns {number} */
      const F=input=>values[input];
      for(let input=0;input<values.length;input++){
        const target=F(input);
        let calls=0;
        /** @param {number} x @returns {number} */
        const observed=x=>{calls++;return F(x);};
        const result=invertBoundedDegree(observed,target,3,2,8,
          {maxResidualDimension:3});
        assert.ok(result,'Every target of a permutation has a preimage');
        assert.equal(result.input,input);
        assert.equal(result.queries,calls);
        assert.ok(calls<=8);
        if(result.exactResidualDimension!==undefined)exactFallbacks++;
        uniqueOracleCalls+=calls;
        targets++;
      }
      return;
    }
    for(let i=fixed;i<values.length;i++){
      [values[fixed],values[i]]=[values[i],values[fixed]];
      enumerate(fixed+1);
      [values[fixed],values[i]]=[values[i],values[fixed]];
    }
  }

  enumerate(0);
  assert.equal(permutations,40320);
  assert.equal(targets,322560);
  assert.ok(exactFallbacks>0);
  assert.ok(exactFallbacks<targets);
  process.stdout.write('OBFS_3BIT_RESIDUAL_EXHAUSTIVE '+JSON.stringify({
    permutations,targets,exactFallbacks,uniqueOracleCalls
  })+'\n');
});
