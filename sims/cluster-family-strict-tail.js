'use strict';

/**
 * @typedef {{native:number,candidate:number,blockId:string}} FamilyPair
 * @typedef {{name:string,protocolId:string,pairs:FamilyPair[]}} FamilyWorkload
 */

/**
 * Bound the probability that ANY workload breaches during one future complete
 * qualification block. Every observed block must contain every workload with
 * the same per-workload pair count in every block. Dependence among all pairs
 * and workloads inside a block is unrestricted; complete blocks must be iid.
 *
 * This directly observes the union event, so it does not apply a Bonferroni K
 * factor. Each individual workload's block-breach probability is no greater
 * than the probability of the union event. A block breaches if any pair in
 * any workload has candidate/native > threshold.
 *
 * Block IDs are declarations, not proof of independent environments.
 *
 * @param {FamilyWorkload[]} workloads
 * @param {{threshold?:number,confidence?:number}} [options]
 * @returns {{
 *   confidenceRequested:number,
 *   workloadCount:number,
 *   workloadNames:string[],
 *   workloadProtocols:Array<{name:string,protocolId:string}>,
 *   independentBlocksDeclared:number,
 *   pairsPerWorkload:Array<{name:string,pairsPerBlock:number}>,
 *   pairsPerBlock:number,
 *   observedPairs:number,
 *   observedStrictBreachPairs:number,
 *   observedStrictBreachBlocks:number,
 *   observedMaxPairedRatio:number,
 *   hasObservedStrictBreach:boolean,
 *   futureAnyWorkloadBlockBreachRateUpperWhenZero:number|null,
 *   assumption:string
 * }}
 */
function clusterFamilyStrictTail(workloads,options={}) {
  if (!Array.isArray(workloads) || workloads.length < 1) {
    throw new TypeError('At least one fixed workload population is required');
  }
  const confidence = options.confidence ?? 0.95;
  const threshold = options.threshold ?? 2.5;
  if (!Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) {
    throw new RangeError('Confidence must lie strictly between zero and one');
  }
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new RangeError('Strict positive finite threshold required');
  }

  const names = new Set();
  /** @type {Map<string,Map<string,{pairs:number,over:number,maxRatio:number}>>} */
  const blocks = new Map();
  /** @type {Map<string,Set<string>>} */
  const idsByWorkload = new Map();
  /** @type {Map<string,number>} */
  const pairsPerWorkload = new Map();

  for (const workload of workloads) {
    if (!workload || typeof workload.name !== 'string' || !workload.name.length) {
      throw new TypeError('Every workload needs a nonempty unique name');
    }
    if (names.has(workload.name)) {
      throw new TypeError('Workload names must be unique');
    }
    names.add(workload.name);
    if (typeof workload.protocolId !== 'string' || !workload.protocolId.trim()) {
      throw new TypeError('Every workload requires a nonempty predeclared protocolId');
    }
    if (!Array.isArray(workload.pairs) || workload.pairs.length === 0) {
      throw new TypeError('Each workload needs at least one paired measurement');
    }

    /** @type {Map<string,{pairs:number,over:number,maxRatio:number}>} */
    const perBlock = new Map();
    for (const pair of workload.pairs) {
      if (!pair || !Number.isFinite(pair.native) || pair.native <= 0 ||
          !Number.isFinite(pair.candidate) || pair.candidate <= 0) {
        throw new RangeError('Both paired times must be finite and positive');
      }
      if (typeof pair.blockId !== 'string' || !pair.blockId.length) {
        throw new TypeError('Every pair requires a nonempty declared blockId');
      }
      const ratio = pair.candidate / pair.native;
      let block = perBlock.get(pair.blockId);
      if (!block) {
        block = {pairs:0,over:0,maxRatio:0};
        perBlock.set(pair.blockId,block);
      }
      block.pairs++;
      block.maxRatio = Math.max(block.maxRatio,ratio);
      if (ratio > threshold) block.over++;

      let global = blocks.get(pair.blockId);
      if (!global) {
        global = new Map();
        blocks.set(pair.blockId,global);
      }
      global.set(workload.name,block);
    }

    const counts = [...perBlock.values()].map(block => block.pairs);
    if (!counts.every(count => count === counts[0])) {
      throw new RangeError('Each workload must have equal pair exposure in every block');
    }
    idsByWorkload.set(workload.name,new Set(perBlock.keys()));
    pairsPerWorkload.set(workload.name,counts[0]);
  }

  const canonicalIds = idsByWorkload.get(workloads[0].name);
  if (!canonicalIds || canonicalIds.size === 0) {
    throw new TypeError('At least one complete-suite block is required');
  }
  for (const workload of workloads) {
    const ids = idsByWorkload.get(workload.name);
    if (!ids || ids.size !== canonicalIds.size ||
        [...canonicalIds].some(id => !ids.has(id))) {
      throw new RangeError('Every complete-suite block must contain every workload');
    }
  }
  for (const [blockId,perWorkload] of blocks) {
    if (perWorkload.size !== workloads.length ||
        workloads.some(workload => !perWorkload.has(workload.name))) {
      throw new RangeError('Every complete-suite block must contain every workload');
    }
    if (!canonicalIds.has(blockId)) {
      throw new RangeError('Inconsistent complete-suite block identifiers');
    }
  }

  let observedPairs = 0;
  let observedStrictBreachPairs = 0;
  let observedStrictBreachBlocks = 0;
  let observedMaxPairedRatio = 0;
  let pairsPerBlock = 0;
  const perWorkloadCounts = [];
  for (const workload of workloads) {
    const count = /** @type {number} */ (pairsPerWorkload.get(workload.name));
    pairsPerBlock += count;
    perWorkloadCounts.push({name:workload.name,pairsPerBlock:count});
  }
  for (const perWorkload of blocks.values()) {
    let blockBreaches = 0;
    for (const stats of perWorkload.values()) {
      observedPairs += stats.pairs;
      observedStrictBreachPairs += stats.over;
      observedMaxPairedRatio = Math.max(observedMaxPairedRatio,stats.maxRatio);
      blockBreaches += stats.over;
    }
    if (blockBreaches > 0) observedStrictBreachBlocks++;
  }

  const independentBlocksDeclared = blocks.size;
  const hasObservedStrictBreach = observedStrictBreachPairs > 0;
  const futureAnyWorkloadBlockBreachRateUpperWhenZero = hasObservedStrictBreach ?
    null : -Math.expm1(Math.log1p(-confidence) / independentBlocksDeclared);

  return {
    confidenceRequested:confidence,
    workloadCount:workloads.length,
    workloadNames:workloads.map(workload => workload.name),
    workloadProtocols:workloads.map(workload => ({name:workload.name,protocolId:workload.protocolId})),
    independentBlocksDeclared,
    pairsPerWorkload:perWorkloadCounts,
    pairsPerBlock,
    observedPairs,
    observedStrictBreachPairs,
    observedStrictBreachBlocks,
    observedMaxPairedRatio,
    hasObservedStrictBreach,
    futureAnyWorkloadBlockBreachRateUpperWhenZero,
    assumption:'Each independent block is a complete fixed qualification suite containing every workload at its declared equal per-block exposure. Pairs and workloads may be arbitrarily dependent within a block. Complete blocks must be iid and identically exposed; block IDs are declarations, not proof. The bound targets the probability that any workload breaches in a future complete-suite block, not worst-case runtime.'
  };
}

module.exports = {clusterFamilyStrictTail};
