'use strict';

const {familywiseBudgetBounds}=require('./familywise-budget-bound');

/**
 * A falsifiable comparison of one candidate and a conventional minifier
 * against the SAME frozen protected application. This is an experiment
 * classifier, never a general obfuscation release or security guarantee.
 * Zero oracle calls is valid for a source-only attack. A complete positive
 * declaration requires matched held-out and resource fields; empirical
 * attacker-cost support remains unavailable until external audit integration.
 *
 * @typedef {'supported'|'contradicted'|'inconclusive'} Decision
 * @typedef {'complete'|'contradicted'|'incomplete'} DeclarationStatus
 * @typedef {{
 *   protocol:string,
 *   oracleCalls:number,
 *   oracleCallBudget?:number,
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
 * Compare actual attack calls against declared matching ceilings when present.
 * A common ceiling is more useful than forcing adaptive arms to consume the
 * same count. This checks only caller declarations; it cannot establish that
 * a ceiling was committed before either artifact was observed. Legacy receipts
 * with no ceiling retain the old stricter equal-actual-consumption requirement.
 *
 * @param {MatchedAttack} control
 * @param {MatchedAttack} candidate
 * @returns {boolean}
 */
function matchedOracleExposure(control,candidate){
  if(!Number.isSafeInteger(control.oracleCalls)||control.oracleCalls<0||
     !Number.isSafeInteger(candidate.oracleCalls)||candidate.oracleCalls<0)
    return false;
  if(control.oracleCallBudget===undefined&&candidate.oracleCallBudget===undefined)
    return control.oracleCalls===candidate.oracleCalls;
  return Number.isSafeInteger(control.oracleCallBudget)&&
    Number.isSafeInteger(candidate.oracleCallBudget)&&
    /** @type {number} */(control.oracleCallBudget)>=0&&
    control.oracleCallBudget===candidate.oracleCallBudget&&
    control.oracleCalls<=/** @type {number} */(control.oracleCallBudget)&&
    candidate.oracleCalls<=/** @type {number} */(candidate.oracleCallBudget);
}

/**
 * @param {CandidateEvidence} evidence
 * @returns {{
 *   verdict:Decision,
 *   attackAdvantage:Decision,
 *   declarationStatus:'complete'|'contradicted'|'incomplete',
 *   externalAuditRequired:boolean,
 *   auditStatus:'not-integrated',
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
    matchedOracleExposure(control,candidate)&&
    Number.isSafeInteger(control.verifiedHeldoutComparisons)&&
    control.verifiedHeldoutComparisons>=evidence.protectedFunctions&&
    control.verifiedHeldoutComparisons===candidate.verifiedHeldoutComparisons;
  // These conditions establish only that a positive *declaration* is
  // complete. This module has no trusted preregistration or server-log verifier,
  // so it must not upgrade caller-supplied digests, ceilings or failure causes
  // into empirical attacker-cost support.
  const positiveDeclarationReady=measurementReady&&
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
  /** @type {DeclarationStatus} */
  let declarationStatus='incomplete';
  if(measurementReady){
    if(candidate.cloneSucceeded)declarationStatus='contradicted';
    else if(positiveDeclarationReady)declarationStatus='complete';
  }
  // An observed successful clone is a real contradiction. A claimed failure
  // after a claimed budget exhaustion is not empirical support until a
  // separate trusted audit binds the pre-run manifest and server-side usage.
  const attackAdvantage=measurementReady&&candidate.cloneSucceeded?
    'contradicted':'inconclusive';
  const externalAuditRequired=declarationStatus==='complete';
  /** @type {Decision} */
  const measuredRuntimeBudget=pairedFamilywise.observedSampleHasOverBudgetPair||
    pairedFamilywise.verdict==='sample-exceeded'?
    'contradicted':pairedFamilywise.verdict==='sample-supported'?
      'supported':'inconclusive';
  /** @type {Decision} */
  // No empirical positive verdict is possible until a trusted audit is wired.
  const verdict=!evidence.nativeOutputAndHostTraceParity||
    measuredRuntimeBudget==='contradicted'||
    attackAdvantage==='contradicted'?
    'contradicted':'inconclusive';
  return {
    verdict,attackAdvantage,declarationStatus,externalAuditRequired,
    auditStatus:'not-integrated',measuredRuntimeBudget,measurementReady,
    pairedFamilywise,
    caveat:'This classifier can check declaration completeness and matched declared ceilings, but it cannot authenticate pre-run commitment timing or server-side request logs. A complete positive declaration is exposed only as declarationStatus=complete with externalAuditRequired=true; empirical attackAdvantage remains inconclusive until a separate trusted audit integration exists. Even an externally audited bounded failure would not prove arbitrary-program secrecy. Runtime evidence covers sampled median paired ratios; a single observed >2.5x pair vetoes the strict sampled-budget claim.'
  };
}

module.exports={compareCandidateEvidence};
