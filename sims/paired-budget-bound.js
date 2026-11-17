'use strict';

/**
 * Honest, distribution-free, one-sided order-statistic diagnostics for the
 * median of paired protected/native runtime ratios. The probability statement
 * assumes independent draws from the same workload/runner distribution; warmup,
 * process drift and alternating order must be considered separately.
 */

/** @typedef {'supported'|'exceeded'|'inconclusive'} BudgetDecision */

/**
 * @param {number[]} values
 * @returns {number}
 */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  const half=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[half]:(sorted[half-1]+sorted[half])/2;
}

/**
 * For n independent continuous observations from a distribution with median m,
 * the probability that m <= X_(k) equals P[Binomial(n,1/2) <= k-1].
 * Return the smallest k attaining requested one-sided confidence.
 *
 * @param {number} n
 * @param {number} confidence
 * @returns {{rank:number,coverage:number}}
 */
function orderStatisticRank(n,confidence){
  if(!Number.isSafeInteger(n)||n<1||n>512){
    throw new RangeError('Sample count must be between 1 and 512');
  }
  if(!Number.isFinite(confidence)||confidence<=0||confidence>=1){
    throw new RangeError('Confidence must be strictly between zero and one');
  }
  let p=2**(-n);
  let cumulative=0;
  for(let rank=1;rank<=n;rank++){
    cumulative+=p;
    if(cumulative>=confidence)return {rank,coverage:cumulative};
    p*= (n-rank+1)/rank;
  }
  throw new RangeError('Too few paired samples for the requested confidence');
}

/**
 * Report paired (within-trial) slowdown separately from the ratio of
 * independent medians. The interval bounds the *population median of paired
 * ratios*, not the ratio of population medians or worst-case runtime.
 *
 * @param {number[]} nativeTrials
 * @param {number[]} protectedTrials
 * @param {{threshold?:number,confidence?:number}} [options]
 * @returns {{
 *   samplePairs:number,threshold:number,confidenceRequested:number,confidenceAttained:number,
 *   nativeMedianMs:number,protectedMedianMs:number,ratioOfMedians:number,
 *   medianOfPairedRatios:number,lowerMedianBound:number,upperMedianBound:number,
 *   upperRank:number,decision:BudgetDecision,observedPairsWithinBudget:number
 * }}
 */
function pairedBudgetBound(nativeTrials,protectedTrials,options={}){
  const threshold=options.threshold??2.5;
  const confidence=options.confidence??0.95;
  if(!Array.isArray(nativeTrials)||!Array.isArray(protectedTrials)||
      nativeTrials.length!==protectedTrials.length||nativeTrials.length<5){
    throw new TypeError('At least five matching native/protected time pairs are required');
  }
  if(!Number.isFinite(threshold)||threshold<=0){
    throw new RangeError('Performance threshold must be positive and finite');
  }
  const pairs=nativeTrials.map((native,index)=>{
    const protectedMs=protectedTrials[index];
    if(!Number.isFinite(native)||native<=0||
        !Number.isFinite(protectedMs)||protectedMs<=0){
      throw new TypeError('Paired durations must be positive and finite');
    }
    return protectedMs/native;
  });
  const ordered=[...pairs].sort((a,b)=>a-b);
  const {rank,coverage}=orderStatisticRank(pairs.length,confidence);
  const lower=ordered[pairs.length-rank];
  const upper=ordered[rank-1];
  const decision=upper<=threshold?'supported':
    lower>threshold?'exceeded':'inconclusive';
  return {
    samplePairs:pairs.length,threshold,confidenceRequested:confidence,
    confidenceAttained:coverage,
    nativeMedianMs:median(nativeTrials),
    protectedMedianMs:median(protectedTrials),
    ratioOfMedians:median(protectedTrials)/median(nativeTrials),
    medianOfPairedRatios:median(pairs),
    lowerMedianBound:lower,
    upperMedianBound:upper,
    upperRank:rank,
    decision,
    observedPairsWithinBudget:pairs.filter(ratio=>ratio<=threshold).length
  };
}

module.exports={pairedBudgetBound,orderStatisticRank};
