'use strict';

/**
 * Median of nonnegative process CPU readings. The high middle observation is
 * used for even-length collections, matching the existing benchmark method.
 * @param {number[]} values
 * @returns {number}
 */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Summarize paired process CPU measurements without inventing ratios when
 * the OS reports zero CPU ticks for either process. A zero remains in the
 * original raw arrays and its paired ratio is null; all valid strict >2.5x
 * comparisons remain counted separately.
 *
 * @param {number[]} baselineMs
 * @param {number[]} candidateMs
 * @returns {{pairedRatios:(number|null)[],ratioOfMedians:number|null,
 *   maxPairedRatio:number|null,strictOverBudgetPairs:number,
 *   unresolvedZeroPairs:number}}
 */
function summarizeCpuPairs(baselineMs, candidateMs) {
  if (baselineMs.length === 0 || baselineMs.length !== candidateMs.length ||
      [...baselineMs, ...candidateMs].some(value =>
        !Number.isFinite(value) || value < 0)) {
    throw new TypeError('CPU pair samples require equal nonempty finite nonnegative arrays');
  }
  const pairedRatios = baselineMs.map((ms, i) =>
    ms > 0 && candidateMs[i] > 0 ? candidateMs[i] / ms : null);
  const resolved = pairedRatios.filter(ratio => ratio !== null);
  const baselineMedian = median(baselineMs);
  const candidateMedian = median(candidateMs);
  return {
    pairedRatios,
    ratioOfMedians: baselineMedian > 0 && candidateMedian > 0
      ? candidateMedian / baselineMedian : null,
    maxPairedRatio: resolved.length ? Math.max(...resolved) : null,
    strictOverBudgetPairs: resolved.filter(ratio => ratio > 2.5).length,
    unresolvedZeroPairs: pairedRatios.length - resolved.length
  };
}

module.exports = {summarizeCpuPairs};
