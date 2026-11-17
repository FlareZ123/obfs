'use strict';

const {pairedBudgetBound}=require('./paired-budget-bound');

/** @typedef {{native:number[],candidate:number[]}} BudgetWorkload */

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
  const verdict=rows.some(row=>row.decision==='exceeded')?
    'sample-exceeded':rows.every(row=>row.decision==='supported')?
      'sample-supported':'sample-inconclusive';
  return {
    verdict,confidenceRequested:confidence,perTailConfidenceRequested,
    familywiseCoverageAtLeast,comparisons:rows.length,rows
  };
}

module.exports={familywiseBudgetBounds};
