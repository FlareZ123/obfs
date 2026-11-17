'use strict';

const {pairedBudgetBound}=require('./paired-budget-bound');

/** @typedef {{native:number[],candidate:number[]}} BudgetWorkload */

/**
 * Exact one-sided binomial inversion when independent representative pairs
 * contain ZERO strict >threshold violations. For a true violation rate p,
 * observing zero in n trials has probability (1-p)^n. At confidence 1-alpha,
 * the upper confidence bound is 1-alpha^(1/n). This does not establish a
 * zero violation rate or any worst-case runtime guarantee.
 *
 * @param {number} samples
 * @param {number} confidence
 * @returns {number}
 */
function zeroViolationUpperRate(samples,confidence) {
  if(!Number.isSafeInteger(samples)||samples<1) {
    throw new RangeError('Zero-violation bound requires positive safe-integer trial count');
  }
  if(!Number.isFinite(confidence)||confidence<=0||confidence>=1) {
    throw new RangeError('Zero-violation confidence must be strictly between zero and one');
  }
  // expm1/log1p prevent cancellation near high confidence or large n.
  return -Math.expm1(Math.log1p(-confidence)/samples);
}

/**
 * A simultaneous, distribution-free diagnostic across distinct measured
 * workloads. Each workload retains the paired-runtime population-median
 * estimand of pairedBudgetBound. Bonferroni protects BOTH interval endpoints
 * for every workload, including when experiments across workloads are
 * dependent. Independence/representativeness of pairs WITHIN each workload
 * remains an assumption. This is a finite-sample diagnostic, not a universal
 * 2.5x performance guarantee.
 *
 * @param {BudgetWorkload[]} workloads
 * @param {{threshold?:number,confidence?:number}} [options]
 * @returns {{
 *   verdict:'sample-supported'|'sample-exceeded'|'sample-inconclusive',
 *   confidenceRequested:number,
 *   perTailConfidenceRequested:number,
 *   familywiseCoverageAtLeast:number,
 *   comparisons:number,
 *   observedMaxPairedRatio:number,
 *   observedOverBudgetPairs:number,
 *   observedSampleHasOverBudgetPair:boolean,
 *   strictTail:{confidenceRequested:number,perWorkloadConfidenceRequested:number,
 *     upperViolationRateWhenZero:(number|null)[],assumption:string},
 *   rows:ReturnType<typeof pairedBudgetBound>[]
 * }}
 */
function familywiseBudgetBounds(workloads,options={}){
  if(!Array.isArray(workloads)||!workloads.length){
    throw new TypeError('At least one paired workload is required');
  }
  const confidence=options.confidence??0.95;
  if(!Number.isFinite(confidence)||confidence<=0||confidence>=1){
    throw new RangeError('Familywise confidence must lie strictly between zero and one');
  }
  // Each workload can support either a "within budget" or "over budget"
  // verdict. Allocate risk to both directions to avoid post-hoc selection.
  const perTailConfidenceRequested=1-(1-confidence)/(2*workloads.length);
  const rows=workloads.map(workload=>pairedBudgetBound(
    workload.native,workload.candidate,{
      threshold:options.threshold,confidence:perTailConfidenceRequested
    }
  ));
  const uncoveredRisk=rows.reduce(
    (sum,row)=>sum+2*(1-row.confidenceAttained),0
  );
  const familywiseCoverageAtLeast=Math.max(0,1-uncoveredRisk);
  // The project's 2.5x requirement is strict, while the inference above is
  // about population medians. Record any observed violation separately.
  // This is a descriptive finite-sample fact, not a probabilistic bound on
  // the worst possible runtime or an independent statistical test.
  const observedMaxPairedRatio=Math.max(...workloads.map((workload,index)=>
    Math.max(...workload.native.map((native,i)=>
      workload.candidate[i]/native
    ))
  ));
  const observedOverBudgetPairs=rows.reduce((sum,row)=>
    sum+(row.samplePairs-row.observedPairsWithinBudget),0);

  const verdict=rows.some(row=>row.decision==='exceeded')?
    'sample-exceeded':rows.every(row=>row.decision==='supported')?
      'sample-supported':'sample-inconclusive';
  // Allocate the total alpha equally across workloads. Bonferroni does not
  // require between-workload independence; within-workload independent,
  // representative paired runtimes remain essential. A positive observed
  // violation vetoes the strict sample, so do not extrapolate a zero-count
  // upper bound to those populations.
  const strictPerWorkloadConfidence=1-(1-confidence)/rows.length;
  const strictTail={
    confidenceRequested:confidence,
    perWorkloadConfidenceRequested:strictPerWorkloadConfidence,
    upperViolationRateWhenZero:rows.map(row=>
      row.observedPairsWithinBudget===row.samplePairs?
        zeroViolationUpperRate(row.samplePairs,strictPerWorkloadConfidence):null),
    assumption:'Independent representative pairs within each fixed workload. '+
      'Bounds concern future breach frequency, not worst-case runtime.'
  };
  return {
    verdict,confidenceRequested:confidence,perTailConfidenceRequested,
    familywiseCoverageAtLeast,comparisons:rows.length,
    observedMaxPairedRatio,observedOverBudgetPairs,
    observedSampleHasOverBudgetPair:observedOverBudgetPairs>0,
    strictTail,rows
  };
}

module.exports={familywiseBudgetBounds,zeroViolationUpperRate};
