'use strict';

/**
 * Each block is one prospectively declared, independently replicated run.
 * Pairs within the same block can be arbitrarily dependent. For example,
 * repeatedly calling a hot function in the same Node process does NOT create
 * new independent blocks. A block is a breach when ANY of its pairs crosses
 * the strict protected/native threshold.
 *
 * @typedef {{native:number,candidate:number,blockId:string}} ClusteredPair
 * @typedef {{pairs:ClusteredPair[]}} ClusteredWorkload
 */

/**
 * Simultaneously bound future block-breach probabilities for K fixed workload
 * populations if each yielded zero breached blocks. The one-sided exact
 * binomial upper endpoint for n independent identical blocks is
 * 1-(alpha/K)^(1/n), Bonferroni across K populations. Any observed strict
 * breach remains a veto and gets a null upper bound. Unlike an individual-pair
 * bound, grouping is insensitive to arbitrary correlation *within* blocks.
 *
 * The caller's blockId strings are untrusted assertions about independent
 * replications, not a proof of iid sampling. Require equal block sizes to
 * avoid treating unequal exposure durations as identical Bernoulli trials.
 *
 * @param {ClusteredWorkload[]} workloads
 * @param {{threshold?:number,confidence?:number}} [options]
 * @returns {{
 *   confidenceRequested:number,
 *   comparisons:number,
 *   strictObservedOverBudgetPairs:number,
 *   strictObservedOverBudgetBlocks:number,
 *   hasObservedStrictBreach:boolean,
 *   perWorkloadConfidenceRequested:number,
 *   assumption:string,
 *   rows:Array<{
 *     independentBlocksDeclared:number,
 *     pairsPerBlock:number,
 *     observedPairs:number,
 *     observedOverBudgetPairs:number,
 *     observedOverBudgetBlocks:number,
 *     observedMaxPairedRatio:number,
 *     futureBlockBreachRateUpperWhenZero:number|null
 *   }>
 * }}
 */
function clusterStrictTail(workloads,options={}){
  if(!Array.isArray(workloads)||workloads.length<1)
    throw new TypeError('At least one fixed workload population is required');
  const confidence=options.confidence??0.95;
  const threshold=options.threshold??2.5;
  if(!Number.isFinite(confidence)||confidence<=0||confidence>=1)
    throw new RangeError('Confidence must lie strictly between zero and one');
  if(!Number.isFinite(threshold)||threshold<=0)
    throw new RangeError('Strict positive finite threshold required');
  const logTail=Math.log1p(-confidence)-Math.log(workloads.length);
  /** @param {number} size @returns {number} */
  const upperFromBlocks=(size)=>-Math.expm1(logTail/size);
  const rows=workloads.map(workload=>{
    if(!workload||!Array.isArray(workload.pairs)||workload.pairs.length===0)
      throw new TypeError('Each population needs at least one paired measurement');
    /** @type {Map<string,{total:number,over:number}>} */
    const blocks=new Map();
    let observedOverBudgetPairs=0;
    let observedMaxPairedRatio=0;
    for(const pair of workload.pairs){
      if(!pair||!Number.isFinite(pair.native)||pair.native<=0||
         !Number.isFinite(pair.candidate)||pair.candidate<=0)
        throw new RangeError('Both paired times must be finite and positive');
      if(typeof pair.blockId!=='string'||!pair.blockId.length)
        throw new TypeError('Every pair requires a nonempty declared blockId');
      let block=blocks.get(pair.blockId);
      if(!block){block={total:0,over:0};blocks.set(pair.blockId,block);}
      block.total++;
      const ratio=pair.candidate/pair.native;
      observedMaxPairedRatio=Math.max(observedMaxPairedRatio,ratio);
      if(ratio>threshold){block.over++;observedOverBudgetPairs++;}
    }
    const sizes=[...blocks.values()].map(block=>block.total);
    const pairsPerBlock=sizes[0];
    if(!sizes.every(size=>size===pairsPerBlock))
      throw new RangeError('Identically exposed blocks must contain equal pair counts');
    const observedOverBudgetBlocks=[...blocks.values()].filter(block=>block.over>0).length;
    return {
      independentBlocksDeclared:blocks.size,pairsPerBlock,
      observedPairs:workload.pairs.length,observedOverBudgetPairs,
      observedOverBudgetBlocks,observedMaxPairedRatio,
      futureBlockBreachRateUpperWhenZero:observedOverBudgetBlocks===0?
        upperFromBlocks(blocks.size):null
    };
  });
  const strictObservedOverBudgetPairs=rows.reduce((sum,row)=>sum+row.observedOverBudgetPairs,0);
  const strictObservedOverBudgetBlocks=rows.reduce((sum,row)=>sum+row.observedOverBudgetBlocks,0);
  return {
    confidenceRequested:confidence,comparisons:rows.length,
    strictObservedOverBudgetPairs,strictObservedOverBudgetBlocks,
    hasObservedStrictBreach:strictObservedOverBudgetPairs>0,
    perWorkloadConfidenceRequested:1-(1-confidence)/rows.length,
    assumption:'Predeclared fixed populations and iid independent blocks within each; '+
      'arbitrary dependence among equal-count pairs in the same block; '+
      'block IDs must be verified independently. Exact one-sided Bonferroni '+
      'confidence bounds on future block violation frequency, not worst-case runtime.',
    rows
  };
}

module.exports={clusterStrictTail};
