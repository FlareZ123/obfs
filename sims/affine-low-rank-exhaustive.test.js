'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {invertLowRankPermutation}=require('./affine-low-rank-oracle');

/**
 * Enumerate every possible permutation of four low-bit symbols.
 * @param {number[]} values
 * @returns {number[][]}
 */
function permutations(values){
  if(values.length===0)return [[]];
  /** @type {number[][]} */
  const result=[];
  for(let i=0;i<values.length;i++){
    for(const suffix of permutations(values.filter((_,index)=>index!==i))){
      result.push([values[i],...suffix]);
    }
  }
  return result;
}

/**
 * Enumerate chosen inputs cyclically for reproducible exact proof corpus.
 * @param {number} seed
 * @returns {()=>number}
 */
function sample(seed){
  let next=seed&15;
  return ()=>{
    const input=next;
    next=(next+1)&15;
    return input;
  };
}

test('every rank-two four-fiber permutation at four bits, every inverse',()=>{
  const p=permutations([0,1,2,3]);
  let verified=0;
  for(const a of p)for(const b of p)for(const c of p)for(const d of p){
    const outputs=[...a,...b.map(v=>v+4),...c.map(v=>v+8),...d.map(v=>v+12)];
    for(let input=0;input<16;input++){
      /** @param {number} v @returns {number} */
      const oracle=v=>outputs[v];
      const result=invertLowRankPermutation(oracle,oracle(input),{
        bits:4,rankBound:2,sample:sample(input+11),maxSamples:16
      });
      assert.equal(result.preimage,input);
      assert.equal(oracle(result.preimage),oracle(input));
      assert.ok(result.orbitCalls<=4);
      assert.ok(result.nullity<=2);
      assert.equal(result.oracleCalls,5+result.samplingCalls+result.orbitCalls);
      verified++;
    }
  }
  assert.equal(verified,5308416);
});
