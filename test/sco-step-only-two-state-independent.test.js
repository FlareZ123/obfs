'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sourceTables,sameContinuation,rootedEquivalence,analyzeIndependentTwoState}=
  require('../sims/sco-step-only-two-state-independent');

test('independent source-table enumeration and unrestricted product graph',()=>{
  const models=sourceTables();
  assert.equal(models.length,260);
  assert.equal(models[0].next.length,1);
  assert.equal(models[4].next.length,2);
  const {pairs,rooted}=rootedEquivalence(models);
  assert.equal(rooted,516);
  for(let index=0;index<rooted;index++){
    assert.equal(pairs[index*rooted+index],1);
  }
  for(let index=0;index<rooted;index++)for(let other=0;other<index;other++){
    assert.equal(pairs[index*rooted+other],pairs[other*rooted+index]);
  }
  const alwaysZero={next:[[0,0]],output:[[0,0]]};
  const alwaysOne={next:[[0,0]],output:[[1,1]]};
  assert.equal(sameContinuation(alwaysZero,0,alwaysZero,0),true);
  assert.equal(sameContinuation(alwaysZero,0,alwaysOne,0),false);
});

test('fully labelled, uncompressed belief graph independently confirms both oracle optima',()=>{
  const result=analyzeIndependentTwoState();
  assert.deepEqual(result,{
    sourceModels:260,rootedVariants:516,explicitBeliefs:4429,
    maxQueryDepth:9,weightedPolicyTotal:1884,expectedPolicyTotal:1776,
    weightedPolicyUnboundedDepth:11,allBeliefsCertified:true
  });
  console.log('SCO_TWO_STATE_INDEPENDENT '+JSON.stringify(result));
});
