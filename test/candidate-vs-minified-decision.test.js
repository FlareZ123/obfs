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
 * Attach a deliberately explicit hypothetical declaration for testing the
 * classifier's declaration-complete path. This is not an externally audited
 * preregistration or server-side request receipt.
 * @param {ReturnType<typeof example>} input
 */
function recordMatchedCompletedAttack(input){
  for(const attack of [input.conventionalControl,input.protectedCandidate]){
    input.requiredHeldoutComparisons=12288;
    attack.verifiedSelectedFunctions=3;
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

test('zero-query static-only source reconstruction is a valid matched attack',()=>{
  const input=example();
  input.conventionalControl.protocol='source-only/AST-reconstruction';
  input.protectedCandidate.protocol='source-only/AST-reconstruction';
  input.conventionalControl.oracleCalls=0;
  input.protectedCandidate.oracleCalls=0;
  const report=compareCandidateEvidence(input);
  assert.equal(report.measurementReady,true);
  assert.equal(report.attackAdvantage,'contradicted');
  assert.equal(report.verdict,'contradicted');
});

test('zero-query static-only candidate failure is declaration-supported only',()=>{
  const input=example();
  recordMatchedCompletedAttack(input);
  input.conventionalControl.oracleCalls=0;
  input.protectedCandidate.oracleCalls=0;
  input.conventionalControl.protocol='source-only/frozen-normalizer';
  input.protectedCandidate.protocol='source-only/frozen-normalizer';
  const report=compareCandidateEvidence(input);
  assert.equal(report.declarationStatus,'complete');
  assert.equal(report.attackAdvantage,'inconclusive');
  assert.equal(report.externalAuditRequired,true);
  assert.equal(report.verdict,'inconclusive');
});

test('oracle count must be a nonnegative safe integer and identical in both arms',()=>{
  for(const count of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
    const input=example();
    input.conventionalControl.oracleCalls=count;
    input.protectedCandidate.oracleCalls=count;
    assert.equal(compareCandidateEvidence(input).measurementReady,false,String(count));
  }
  const unequal=example();
  unequal.conventionalControl.oracleCalls=0;
  assert.equal(compareCandidateEvidence(unequal).measurementReady,false);
});

test('positive claim requires a declared, satisfied held-out verification floor',()=>{
  const missing=example();
  recordMatchedCompletedAttack(missing);
  delete missing.requiredHeldoutComparisons;
  assert.equal(compareCandidateEvidence(missing).attackAdvantage,'inconclusive');
  const short=example();
  recordMatchedCompletedAttack(short);
  short.conventionalControl.verifiedHeldoutComparisons=3;
  short.protectedCandidate.verifiedHeldoutComparisons=3;
  assert.equal(compareCandidateEvidence(short).measurementReady,true);
  assert.equal(compareCandidateEvidence(short).attackAdvantage,'inconclusive');
  const below=example();
  recordMatchedCompletedAttack(below);
  below.requiredHeldoutComparisons=12289;
  assert.equal(compareCandidateEvidence(below).attackAdvantage,'inconclusive');
  const invalid=example();
  recordMatchedCompletedAttack(invalid);
  invalid.requiredHeldoutComparisons=2.5;
  assert.equal(compareCandidateEvidence(invalid).attackAdvantage,'inconclusive');
});

test('non-finite, fractional or unsafe held-out counts cannot establish positive evidence',()=>{
  const invalidCounts=[-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1];
  for(const count of invalidCounts){
    const input=example();
    recordMatchedCompletedAttack(input);
    input.conventionalControl.verifiedHeldoutComparisons=count;
    input.protectedCandidate.verifiedHeldoutComparisons=count;
    const report=compareCandidateEvidence(input);
    assert.equal(report.measurementReady,false,String(count));
    assert.equal(report.attackAdvantage,'inconclusive',String(count));
    assert.equal(report.verdict,'inconclusive',String(count));
  }
  const unsafeProtected=example();
  recordMatchedCompletedAttack(unsafeProtected);
  unsafeProtected.protectedFunctions=Number.MAX_SAFE_INTEGER+1;
  assert.equal(compareCandidateEvidence(unsafeProtected).measurementReady,false);
});

test('unsupported candidate failure does not establish a positive advantage',()=>{
  const input=example();
  input.protectedCandidate.cloneSucceeded=false;
  const report=compareCandidateEvidence(input);
  assert.equal(report.measurementReady,true);
  assert.equal(report.attackAdvantage,'inconclusive');
  assert.equal(report.verdict,'inconclusive');
});

test('complete caller declarations require external audit before empirical support',()=>{
  const input=example();
  recordMatchedCompletedAttack(input);
  const report=compareCandidateEvidence(input);
  assert.equal(report.declarationStatus,'complete');
  assert.equal(report.attackAdvantage,'inconclusive');
  assert.equal(report.externalAuditRequired,true);
  assert.equal(report.auditStatus,'not-integrated');
  assert.equal(report.measuredRuntimeBudget,'supported');
  assert.equal(report.verdict,'inconclusive');
  assert.match(report.caveat,/cannot authenticate pre-run commitment/u);
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
  const fields=/** @type {const} */ ([
    'selectedFunctionSetDigest','verifierCaseDigest','methodCommitmentDigest',
    'preparationBudgetMs','analysisBudgetMs'
  ]);
  for(const field of fields){
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

test('positive gap requires all selected functions to be verified',()=>{
  const input=example();
  recordMatchedCompletedAttack(input);
  input.protectedCandidate.verifiedSelectedFunctions=1;
  assert.equal(compareCandidateEvidence(input).attackAdvantage,'inconclusive');
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

test('truthy strings cannot impersonate committed, executed attacks',()=>{
  for(const target of ['frozenSameApplication','controlAttempted','candidateAttempted',
    'controlCloneSucceeded','candidateCloneSucceeded']){
    const input=/** @type {any} */ (example());
    recordMatchedCompletedAttack(input);
    if(target==='frozenSameApplication')input.frozenSameApplication='false';
    if(target==='controlAttempted')input.conventionalControl.attempted='false';
    if(target==='candidateAttempted')input.protectedCandidate.attempted='false';
    if(target==='controlCloneSucceeded')input.conventionalControl.cloneSucceeded='true';
    if(target==='candidateCloneSucceeded')input.protectedCandidate.cloneSucceeded='false';
    const verdict=compareCandidateEvidence(input);
    assert.equal(verdict.measurementReady,false,target);
    assert.equal(verdict.attackAdvantage,'inconclusive',target);
    assert.equal(verdict.verdict,'inconclusive',target);
  }
});

test('positive attacker-cost claim requires a string protocol and valid SHA-256 commitments',()=>{
  const badProtocol=/** @type {any} */ (example());
  recordMatchedCompletedAttack(badProtocol);
  const sameArray=['source-only/AST-reconstruction'];
  badProtocol.conventionalControl.protocol=sameArray;
  badProtocol.protectedCandidate.protocol=sameArray;
  assert.equal(compareCandidateEvidence(badProtocol).measurementReady,false);
  assert.equal(compareCandidateEvidence(badProtocol).verdict,'inconclusive');
  for(const field of ['selectedFunctionSetDigest','verifierCaseDigest','methodCommitmentDigest']){
    for(const malformed of ['g'.repeat(64),'a'.repeat(63)+' ', 'A'.repeat(64)]){
      const input=/** @type {any} */ (example());
      recordMatchedCompletedAttack(input);
      input.conventionalControl[field]=malformed;
      input.protectedCandidate[field]=malformed;
      const verdict=compareCandidateEvidence(input);
      assert.equal(verdict.attackAdvantage,'inconclusive',field+':'+malformed.slice(0,2));
      assert.equal(verdict.verdict,'inconclusive',field);
    }
  }
});


test('equal declared oracle ceilings permit unequal consumption but not empirical support',()=>{
  const input=example();
  recordMatchedCompletedAttack(input);
  // A single adaptive source+oracle protocol may solve a conventional
  // minifier from public bytes without calling the service, yet spend its
  // full *declared* 100-query budget trying to recover the candidate.
  input.conventionalControl.oracleCalls=0;
  input.protectedCandidate.oracleCalls=100;
  input.conventionalControl.oracleCallBudget=100;
  input.protectedCandidate.oracleCallBudget=100;
  const report=compareCandidateEvidence(input);
  assert.equal(report.measurementReady,true);
  assert.equal(report.declarationStatus,'complete');
  assert.equal(report.attackAdvantage,'inconclusive');
  assert.equal(report.externalAuditRequired,true);
  assert.equal(report.verdict,'inconclusive');
});

test('unequal oracle use requires credible equal caps and no overdraw',()=>{
  const missing=example();
  recordMatchedCompletedAttack(missing);
  missing.conventionalControl.oracleCalls=0;
  missing.protectedCandidate.oracleCalls=100;
  assert.equal(compareCandidateEvidence(missing).measurementReady,false);

  const unequal=example();
  recordMatchedCompletedAttack(unequal);
  unequal.conventionalControl.oracleCalls=0;
  unequal.protectedCandidate.oracleCalls=100;
  unequal.conventionalControl.oracleCallBudget=100;
  unequal.protectedCandidate.oracleCallBudget=101;
  assert.equal(compareCandidateEvidence(unequal).measurementReady,false);

  const overdraw=example();
  recordMatchedCompletedAttack(overdraw);
  overdraw.conventionalControl.oracleCalls=0;
  overdraw.protectedCandidate.oracleCalls=101;
  overdraw.conventionalControl.oracleCallBudget=100;
  overdraw.protectedCandidate.oracleCallBudget=100;
  assert.equal(compareCandidateEvidence(overdraw).measurementReady,false);

  for(const invalid of [-1,0.2,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
    const bad=example();
    recordMatchedCompletedAttack(bad);
    bad.conventionalControl.oracleCalls=0;
    bad.protectedCandidate.oracleCalls=100;
    bad.conventionalControl.oracleCallBudget=invalid;
    bad.protectedCandidate.oracleCallBudget=invalid;
    assert.equal(compareCandidateEvidence(bad).measurementReady,false,String(invalid));
  }
});

test('equal actual oracle use stays compatible without optional cap',()=>{
  const input=example();
  recordMatchedCompletedAttack(input);
  assert.equal(compareCandidateEvidence(input).declarationStatus,'complete');
  assert.equal(compareCandidateEvidence(input).attackAdvantage,'inconclusive');
  input.conventionalControl.oracleCallBudget=0;
  input.protectedCandidate.oracleCallBudget=1;
  // Once ceilings are explicitly declared, contradictory limits are
  // not a fair comparison, even when both arms consumed the same number.
  assert.equal(compareCandidateEvidence(input).measurementReady,false);
  input.protectedCandidate.oracleCallBudget=0;
  assert.equal(compareCandidateEvidence(input).attackAdvantage,'inconclusive',
    'The equal cap 0 cannot support 3 observed oracle requests');
  input.conventionalControl.oracleCallBudget=3;
  input.protectedCandidate.oracleCallBudget=3;
  assert.equal(compareCandidateEvidence(input).declarationStatus,'complete');
  assert.equal(compareCandidateEvidence(input).attackAdvantage,'inconclusive');
});
