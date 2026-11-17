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

/**
 * Attach a deliberately explicit hypothetical attack commitment for testing
 * the classifier's positive path. The real matched four-way attack succeeded
 * for both versions and does not present these hypothetical failure records.
 * @param {ReturnType<typeof example>} input
 */
function recordMatchedCompletedAttack(input){
  for(const attack of [input.conventionalControl,input.protectedCandidate]){
    attack.selectedFunctionSetDigest='a'.repeat(64);
    attack.verifierCaseDigest='b'.repeat(64);
    attack.methodCommitmentDigest='c'.repeat(64);
    attack.preparationBudgetMs=60000;
    attack.analysisBudgetMs=120000;
    attack.attackCompleted=true;
    attack.failureCause='none';
  }
  input.protectedCandidate.cloneSucceeded=false;
  input.protectedCandidate.failureCause='precommitted-budget-exhausted';
}

test('unsupported candidate failure does not establish a positive advantage',()=>{
  const input=example();
  input.protectedCandidate.cloneSucceeded=false;
  const report=compareCandidateEvidence(input);
  assert.equal(report.measurementReady,true);
  assert.equal(report.attackAdvantage,'inconclusive');
  assert.equal(report.verdict,'inconclusive');
});

test('precommitted matched completed attacker gap can be boundedly supported',()=>{
  const input=example();
  recordMatchedCompletedAttack(input);
  const report=compareCandidateEvidence(input);
  assert.equal(report.attackAdvantage,'supported');
  assert.equal(report.measuredRuntimeBudget,'supported');
  assert.equal(report.verdict,'supported');
  assert.match(report.caveat,/not proof/u);
});

test('one held-out comparison versus 12,288 cannot support positive superiority',()=>{
  const input=example();
  recordMatchedCompletedAttack(input);
  input.protectedCandidate.verifiedHeldoutComparisons=1;
  const report=compareCandidateEvidence(input);
  assert.equal(report.measurementReady,false);
  assert.equal(report.attackAdvantage,'inconclusive');
  assert.equal(report.verdict,'inconclusive');
});

test('positive gap requires equal case and function witnesses, method and budgets',()=>{
  for(const field of [
    'selectedFunctionSetDigest','verifierCaseDigest','methodCommitmentDigest',
    'preparationBudgetMs','analysisBudgetMs'
  ]){
    const input=example();
    recordMatchedCompletedAttack(input);
    if(field==='preparationBudgetMs'||field==='analysisBudgetMs'){
      input.protectedCandidate[field]=30000;
    }else{
      input.protectedCandidate[field]='d'.repeat(64);
    }
    assert.equal(compareCandidateEvidence(input).attackAdvantage,'inconclusive',field);
  }
});

test('positive gap requires completed attack and a budget-exhaustion witness',()=>{
  const missingCompletion=example();
  recordMatchedCompletedAttack(missingCompletion);
  missingCompletion.protectedCandidate.attackCompleted=false;
  assert.equal(compareCandidateEvidence(missingCompletion).attackAdvantage,'inconclusive');
  const modelMismatch=example();
  recordMatchedCompletedAttack(modelMismatch);
  modelMismatch.protectedCandidate.failureCause='model-mismatch';
  assert.equal(compareCandidateEvidence(modelMismatch).attackAdvantage,'inconclusive');
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
