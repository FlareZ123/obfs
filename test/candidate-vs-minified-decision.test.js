'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {compareCandidateEvidence}=require('../sims/candidate-vs-minified-decision');

/** @returns {Parameters<typeof compareCandidateEvidence>[0]} */
function example(){
  return {
    frozenSameApplication:true,
    nativeOutputAndHostTraceParity:true,
    protectedFunctions:3,
    conventionalControl:{
      protocol:'int32-translation/three-f0-queries',oracleCalls:3,
      attempted:true,cloneSucceeded:true,verifiedHeldoutComparisons:12288
    },
    protectedCandidate:{
      protocol:'int32-translation/three-f0-queries',oracleCalls:3,
      attempted:true,cloneSucceeded:true,verifiedHeldoutComparisons:12288
    },
    sessionPairs:[1,50,1000,10000].map(()=>({
      native:Array(13).fill(1),candidate:Array(13).fill(1.3)
    }))
  };
}

test('both versions cloned by identical attack gives no measured advantage',()=>{
  const report=compareCandidateEvidence(example());
  assert.equal(report.measurementReady,true);
  assert.equal(report.attackAdvantage,'contradicted');
  assert.equal(report.measuredRuntimeBudget,'supported');
  assert.equal(report.verdict,'contradicted');
  assert.equal(report.pairedFamilywise.comparisons,4);
});

test('falsifiable equal-budget attacker gap can be boundedly supported',()=>{
  const input=example();
  input.protectedCandidate.cloneSucceeded=false;
  const report=compareCandidateEvidence(input);
  assert.equal(report.attackAdvantage,'supported');
  assert.equal(report.measuredRuntimeBudget,'supported');
  assert.equal(report.verdict,'supported');
  assert.match(report.caveat,/not proof/u);
});

test('different oracle budgets, applications or absent protected yield stay inconclusive',()=>{
  const budget=example();
  budget.protectedCandidate.oracleCalls=4;
  assert.equal(compareCandidateEvidence(budget).verdict,'inconclusive');
  const frozen=example();
  frozen.frozenSameApplication=false;
  assert.equal(compareCandidateEvidence(frozen).verdict,'inconclusive');
  const noYield=example();
  noYield.protectedFunctions=0;
  assert.equal(compareCandidateEvidence(noYield).verdict,'inconclusive');
  const unattempted=example();
  unattempted.protectedCandidate.attempted=false;
  assert.equal(compareCandidateEvidence(unattempted).verdict,'inconclusive');
});

test('one observed strict-budget breach vetoes median-supported inference',()=>{
  const input=example();
  input.protectedCandidate.cloneSucceeded=false;
  input.sessionPairs[0].candidate[0]=3.3;
  const report=compareCandidateEvidence(input);
  assert.equal(report.pairedFamilywise.verdict,'sample-supported');
  assert.equal(report.pairedFamilywise.observedOverBudgetPairs,1);
  assert.equal(report.measuredRuntimeBudget,'contradicted');
  assert.equal(report.verdict,'contradicted');
});

test('actual native-output or external-host trace divergence vetoes candidate',()=>{
  const input=example();
  input.nativeOutputAndHostTraceParity=false;
  input.protectedCandidate.cloneSucceeded=false;
  assert.equal(compareCandidateEvidence(input).verdict,'contradicted');
});
