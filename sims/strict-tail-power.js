'use strict';

/**
 * Predeclare the number of *independent representative pairs per workload*
 * required to bound the probability of a strict runtime-budget breach below
 * maxBreachRate, with a simultaneous 1-alpha confidence guarantee across
 * workloadCount fixed workloads, provided EVERY observed pair is breach-free.
 *
 * A zero count from n iid Bernoulli trials has probability (1-p)^n. With
 * Bonferroni allocation alpha/workloadCount, the inverse of this upper
 * Clopper-Pearson endpoint requires
 * n >= log(alpha/workloadCount) / log(1-maxBreachRate).
 * Between-workload independence is not required. Nothing about worst-case
 * runtime, adversarially chosen workloads, or compiler cost follows.
 *
 * @param {number} maxBreachRate Target upper bound, strictly between 0 and 1.
 * @param {number} confidence Joint confidence, strictly between 0 and 1.
 * @param {number} workloadCount Positive, safe-integer number of fixed populations.
 * @returns {{pairsPerWorkload:number,totalPairs:number,
 *   maxBreachRate:number,confidenceRequested:number,workloadCount:number,
 *   upperRateAtPlan:number,upperRateAtOneFewer:number|null,
 *   assumption:string}}
 */
function planZeroBreachSamples(maxBreachRate,confidence,workloadCount) {
  if(!Number.isFinite(maxBreachRate)||maxBreachRate<=0||maxBreachRate>=1)
    throw new RangeError('Target breach rate must lie strictly between zero and one');
  if(!Number.isFinite(confidence)||confidence<=0||confidence>=1)
    throw new RangeError('Confidence must lie strictly between zero and one');
  if(!Number.isSafeInteger(workloadCount)||workloadCount<1)
    throw new RangeError('Workload count must be a positive safe integer');
  const logTail=Math.log1p(-confidence)-Math.log(workloadCount);
  const logNoBreach=Math.log1p(-maxBreachRate);
  const exactReal=logTail/logNoBreach;
  if(!Number.isFinite(exactReal)||exactReal>Number.MAX_SAFE_INTEGER-1)
    throw new RangeError('Required sample count exceeds safe integer precision');
  let n=Math.max(1,Math.ceil(exactReal));
  // Correct an exact-integer boundary rounded slightly by floating point.
  // Compare log-probabilities to avoid underflow for rare events.
  if(n*logNoBreach>logTail)n++;
  if(n>1&&(n-1)*logNoBreach<=logTail)n--;
  if(!Number.isSafeInteger(n)||!Number.isSafeInteger(n*workloadCount))
    throw new RangeError('Total required sample count exceeds safe integer precision');
  /** @param {number} size @returns {number} */
  const bound=(size)=>-Math.expm1(logTail/size);
  return {
    pairsPerWorkload:n,totalPairs:n*workloadCount,
    maxBreachRate,confidenceRequested:confidence,workloadCount,
    upperRateAtPlan:bound(n),
    upperRateAtOneFewer:n>1?bound(n-1):null,
    assumption:'Fixed workload populations; independent representative pairs within each; '+
      'zero strict breaches in every population; no worst-case bound.'
  };
}

module.exports={planZeroBreachSamples};
