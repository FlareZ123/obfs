'use strict';

const {familywiseBudgetBounds}=require('./familywise-budget-bound');

/**
 * A falsifiable comparison of one candidate and a conventional minifier
 * against the SAME frozen protected application. This is an experiment
 * classifier, never a general obfuscation release or security guarantee.
 * Zero oracle calls is valid for a source-only attack. Positive support
 * requires a predeclared held-out verification count; a short or missing
 * commitment remains inconclusive.
 *
 * @typedef {'supported'|'contradicted'|'inconclusive'} Decision
 * @typedef {{
 *   protocol:string,
 *   oracleCalls:number,
 *   attempted:boolean,
 *   cloneSucceeded:boolean,
 *   verifiedHeldoutComparisons:number,
 *   verifiedSelectedFunctions?:number,
 *   selectedFunctionSetDigest?:string,
 *   verifierCaseDigest?:string,
 *   methodCommitmentDigest?:string,
 *   preparationBudgetMs?:number,
 *   analysisBudgetMs?:number,
 *   attackCompleted?:boolean,
 *   failureCause?:'none'|'precommitted-budget-exhausted'|'model-mismatch'|'unmeasured'
 * }} MatchedAttack
 * @typedef {{
 *   frozenSameApplication:boolean,
 *   nativeOutputAndHostTraceParity:boolean,
 *   protectedFunctions:number,
 *   requiredHeldoutComparisons?:number,
 *   conventionalControl:MatchedAttack,
 *   protectedCandidate:MatchedAttack,
 *   sessionPairs:Array<{native:number[],candidate:number[]}>
 * }} CandidateEvidence
 */

/** @param {unknown} value @returns {boolean} */
function isCanonicalSha256(value){
  return typeof value==='string'&&/^[0-9a-f]{64}$/u.test(value);
}

/**
 * @param {CandidateEvidence} evidence
 * @returns {{
 *   verdict:Decision,
 *   attackAdvantage:Decision,
 *   measuredRuntimeBudget:Decision,
 *   measurementReady:boolean,
 *   pairedFamilywise:ReturnType<typeof familywiseBudgetBounds>,
 *   caveat:string
 * }}
 */
function compareCandidateEvidence(evidence){
  const pairedFamilywise=familywiseBudgetBounds(evidence.sessionPairs);
  const control=evidence.conventionalControl;
  const candidate=evidence.protectedCandidate;
  const measurementReady=evidence.frozenSameApplication===true&&
    Number.isSafeInteger(evidence.protectedFunctions)&&evidence.protectedFunctions>0&&
    control.attempted===true&&candidate.attempted===true&&
    typeof control.cloneSucceeded==='boolean'&&
    typeof candidate.cloneSucceeded==='boolean'&&
    typeof control.protocol==='string'&&control.protocol.length>0&&
    control.protocol===candidate.protocol&&
    Number.isSafeInteger(control.oracleCalls)&&control.oracleCalls>=0&&
    control.oracleCalls===candidate.oracleCalls&&
    Number.isSafeInteger(control.verifiedHeldoutComparisons)&&
    control.verifiedHeldoutComparisons>=evidence.protectedFunctions&&
    control.verifiedHeldoutComparisons===candidate.verifiedHeldoutComparisons;
  // A positive claim requires a completed, precommitted, equally resourced
  // attack on the same functions and held-out inputs, with a recorded reason
  // for failure. These fields are evidence declarations, not independently
  // authenticated artifacts: the experimenter must verify the commitments.
  const positiveEvidenceReady=measurementReady&&
    evidence.nativeOutputAndHostTraceParity===true&&
    typeof evidence.requiredHeldoutComparisons==='number'&&
    Number.isSafeInteger(evidence.requiredHeldoutComparisons)&&
    evidence.requiredHeldoutComparisons>=evidence.protectedFunctions&&
    control.verifiedHeldoutComparisons>=evidence.requiredHeldoutComparisons&&
    control.verifiedSelectedFunctions===evidence.protectedFunctions&&
    candidate.verifiedSelectedFunctions===evidence.protectedFunctions&&
    control.attackCompleted===true&&candidate.attackCompleted===true&&
    candidate.failureCause==='precommitted-budget-exhausted'&&
    control.cloneSucceeded===true&&candidate.cloneSucceeded===false&&
    isCanonicalSha256(control.selectedFunctionSetDigest)&&
    control.selectedFunctionSetDigest===candidate.selectedFunctionSetDigest&&
    isCanonicalSha256(control.verifierCaseDigest)&&
    control.verifierCaseDigest===candidate.verifierCaseDigest&&
    isCanonicalSha256(control.methodCommitmentDigest)&&
    control.methodCommitmentDigest===candidate.methodCommitmentDigest&&
    typeof control.preparationBudgetMs==='number'&&
    Number.isFinite(control.preparationBudgetMs)&&control.preparationBudgetMs>0&&
    control.preparationBudgetMs===candidate.preparationBudgetMs&&
    typeof control.analysisBudgetMs==='number'&&
    Number.isFinite(control.analysisBudgetMs)&&control.analysisBudgetMs>0&&
    control.analysisBudgetMs===candidate.analysisBudgetMs;
  /** @type {Decision} */
  let attackAdvantage='inconclusive';
  if(measurementReady){
    if(candidate.cloneSucceeded)attackAdvantage='contradicted';
    else if(positiveEvidenceReady)attackAdvantage='supported';
  }
  /** @type {Decision} */
  const measuredRuntimeBudget=pairedFamilywise.observedSampleHasOverBudgetPair||
    pairedFamilywise.verdict==='sample-exceeded'?
    'contradicted':pairedFamilywise.verdict==='sample-supported'?
      'supported':'inconclusive';
  /** @type {Decision} */
  const verdict=!evidence.nativeOutputAndHostTraceParity||
    measuredRuntimeBudget==='contradicted'||
    attackAdvantage==='contradicted'?
    'contradicted':measurementReady&&
    attackAdvantage==='supported'&&measuredRuntimeBudget==='supported'?
      'supported':'inconclusive';
  return {
    verdict,attackAdvantage,measuredRuntimeBudget,measurementReady,
    pairedFamilywise,
    caveat:'A positive attacker-cost judgment requires independently checked precommitted methods, verifier cases, selected functions and equivalent preparation/analysis budgets. Even a completed failed bounded attack is not proof of arbitrary-program secrecy. Runtime evidence covers sampled median paired ratios; a single observed >2.5x pair vetoes the strict sampled-budget claim.'
  };
}

module.exports={compareCandidateEvidence};
