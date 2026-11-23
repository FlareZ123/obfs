'use strict';

const {invertByReanchoring}=require('./random-affine-anchor-compatible-inversion');
const {learnFlag}=require('./affine-flag-oracle-attacker');

/** @typedef {'reanchor'|'sampled-flag'|'refused'} Route */
/** @typedef {{route:Route,verified:boolean,input:number|null,
 *   queries:number,reanchorQueries:number,flagQueries:number}} PortfolioResult */

/**
 * A bounded, source-independent *attacker* portfolio for numeric 32-bit
 * forward oracles. It tries the inexpensive exact-verifying reanchored
 * fixed-point attack before learning a more expensive sampled derivative
 * flag. Both algorithms share one real-oracle cache.
 *
 * A measured source-independent attack may refuse: neither algorithm has
 * a general completeness guarantee for arbitrary compatible permutations.
 * No candidate is reported as a recovered preimage without checking its
 * equality with the requested target against the actual oracle.
 *
 * @param {(input:number)=>number} rawOracle
 * @param {number} target
 * @param {{reanchorSeed?:number,flagSeed?:number,maxBases?:number,
 *   samplesPerStage?:number,maxQueries?:number}} [options]
 * @returns {PortfolioResult}
 */
function invertWithPortfolio(rawOracle,target,options={}) {
  if(!Number.isSafeInteger(target)||target<0||target>0xffffffff)
    throw new RangeError('Target must be an unsigned 32-bit integer');

  const maxQueries=options.maxQueries??20000;
  if(!Number.isSafeInteger(maxQueries)||maxQueries<1)
    throw new RangeError('maxQueries must be a positive safe integer');

  /** @type {Map<number,number>} */
  const cache=new Map();
  /** @param {number} input @returns {number} */
  function query(input) {
    const key=input>>>0;
    const previous=cache.get(key);
    if(previous!==undefined)return previous;
    if(cache.size>=maxQueries)throw new RangeError('Oracle budget exceeded');
    const value=rawOracle(key);
    if(!Number.isSafeInteger(value)||value<0||value>0xffffffff)
      throw new TypeError('Oracle must return unsigned 32-bit integers');
    cache.set(key,value>>>0);
    return value>>>0;
  }

  const seed=options.reanchorSeed??0x71ed3a29;
  try {
    const previous=invertByReanchoring(query,target,seed,options.maxBases??4);
    if(query(previous.value)!==target)
      throw new Error('Reanchor oracle invariant violated');
    return {
      route:'reanchor',verified:true,input:previous.value>>>0,
      queries:cache.size,reanchorQueries:cache.size,flagQueries:0
    };
  }catch(error) {
    if(!String(error).includes('No successful reanchored inversion'))
      throw error;
  }

  const reanchorQueries=cache.size;
  const learned=learnFlag(query,{
    bits:32,samplesPerStage:options.samplesPerStage??16,
    sampleSeed:options.flagSeed??0xc27f53a1,maxQueries
  });
  if(learned.status==='unsupported')return {
    route:'refused',verified:false,input:null,queries:cache.size,
    reanchorQueries,flagQueries:cache.size-reanchorQueries
  };

  /** @type {import('./affine-flag-oracle-attacker').InverseResult} */
  const candidate=learned.invert(target);
  if(!candidate.verified)return {
    route:'refused',verified:false,input:null,queries:cache.size,
    reanchorQueries,flagQueries:cache.size-reanchorQueries
  };
  return {
    route:'sampled-flag',verified:true,input:candidate.input,
    queries:cache.size,reanchorQueries,
    flagQueries:cache.size-reanchorQueries
  };
}

module.exports={invertWithPortfolio};
