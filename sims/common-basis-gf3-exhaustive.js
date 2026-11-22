'use strict';

const assert=require('node:assert/strict');

/** @param {number} v @returns {number} */
function x(v){return v%3;}
/** @param {number} v @returns {number} */
function y(v){return Math.floor(v/3);}
/** @param {number} a @param {number} b @returns {number} */
function determinant(a,b){
  return ((x(a)*y(b)-y(a)*x(b))%3+3)%3;
}
/** @param {number} seed @returns {()=>number} */
function random(seed){
  let state=seed>>>0;
  assert.ok(state!==0);
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  };
}

/** @returns {void} */
function main(){
  /** @type {[number,number][]} */
  const bases=[];
  for(let a=1;a<9;a++)for(let b=1;b<9;b++){
    if(determinant(a,b))bases.push([a,b]);
  }
  assert.equal(bases.length,48);
  const values=[1,2,3,4,5,6,7,8];
  const pick=random(20261122);
  /** @type {Map<number,number>} */
  const histogram=new Map();
  let tested=0, singular=0, maxTrials=0, maxDistinctCalls=0;
  /** @param {number} depth @returns {void} */
  function visit(depth){
    if(depth===values.length){
      const permutation=[0,...values];
      tested++;
      let good=0;
      for(const [a,b] of bases){
        if(determinant(permutation[a],permutation[b]))good++;
      }
      assert.ok(good>0,'Every permutation needs a good common basis');
      histogram.set(good,(histogram.get(good)??0)+1);
      if(determinant(permutation[1],permutation[3])!==0)return;
      singular++;
      const observed=new Set([0,1,3]);
      /** @type {[number,number]} */
      const input=[1,3];
      /** @type {[number,number]} */
      const output=[permutation[1],permutation[3]];
      let trials=0;
      for(;;){
        const candidate=pick()%9;
        if(candidate===0)continue;
        trials++;
        observed.add(candidate);
        if(determinant(permutation[candidate],output[0])===0)continue;
        if(x(candidate)!==0){
          input[0]=candidate;output[0]=permutation[candidate];
        }else{
          input[1]=candidate;output[1]=permutation[candidate];
        }
        assert.notEqual(determinant(input[0],input[1]),0);
        assert.notEqual(determinant(output[0],output[1]),0);
        break;
      }
      maxTrials=Math.max(maxTrials,trials);
      maxDistinctCalls=Math.max(maxDistinctCalls,observed.size);
      return;
    }
    for(let i=depth;i<values.length;i++){
      [values[depth],values[i]]=[values[i],values[depth]];
      visit(depth+1);
      [values[depth],values[i]]=[values[i],values[depth]];
    }
  }
  visit(0);
  assert.equal(tested,40320);
  assert.equal(singular,5760);
  console.log('COMMON_BASIS_GF3 '+JSON.stringify({
    permutations:tested,orderedInputBases:bases.length,singularStandardBasis:singular,
    commonBasesHistogram:Object.fromEntries([...histogram.entries()].sort((a,b)=>a[0]-b[0])),
    maximumValidCandidateTrials:maxTrials,maximumDistinctOracleCalls:maxDistinctCalls,
    theoreticalGeneralGF3SuccessProbabilityAtLeast:'5/8'
  }));
}
if(require.main===module)main();
module.exports={determinant,main};
