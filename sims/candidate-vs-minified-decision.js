'use strict';

const {familywiseBudgetBounds}=require('./familywise-budget-bound');

/**
 * A falsifiable comparison of one candidate and a conventional minifier
 * against the SAME frozen protected application. This is an experiment
 * classifier, never a general obfuscation release or security guarantee.
 *
 * @typedef {'supported'|'contradicted'|'inconclusive'} Decision
 * @typedef {{
 *   protocol:string,
 *   oracleCalls:number,
 *   attempted:boolean,
 *   cloneSucceeded:boolean,
 *   verifiedHeldoutComparisons:number
 * }} MatchedAttack
 * @typedef {{
 *   frozenSameApplication:boolean,
 *   nativeOutputAndHostTraceParity:boolean,
 *   protectedFunctions:number,
 *   conventionalControl:MatchedAttack,
 *   protectedCandidate:MatchedAttack,
 *   sessionPairs:Array<{native:number[],candidate:number[]}>
 * }} CandidateEvidence
 */

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
  const measurementReady=evidence.frozenSameApplication&&
    Number.isInteger(evidence.protectedFunctions)&&evidence.protectedFunctions>0&&
    control.attempted&&candidate.attempted&&
    control.protocol.length>0&&control.protocol===candidate.protocol&&
    control.oracleCalls===candidate.oracleCalls&&control.oracleCalls>0&&
    control.verifiedHeldoutComparisons>0&&
    candidate.verifiedHeldoutComparisons>0;
  /** @type {Decision} */
  let attackAdvantage='inconclusive';
  if(measurementReady){
    if(candidate.cloneSucceeded)attackAdvantage='contradicted';
    else if(control.cloneSucceeded)attackAdvantage='supported';
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
    caveat:'The judgment covers only the named equal-query attacker, one original application and the sampled workloads. Failure of a bounded attack is not proof of arbitrary-program secrecy. Sampled confidence is about median paired ratios, while a single observed >2.5x pair vetoes the tested strict-budget claim.'
  };
}

module.exports={compareCandidateEvidence};
