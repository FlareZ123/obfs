'use strict';

const {binaryWords}=require('./sco-sync-search');

/** @typedef {{step:(symbol:number)=>Promise<number>}} StepOnlyOracle */

/**
 * Try candidate synchronizing words through a step-only black-box API.
 * Scrambles include both input symbols, and the suffixes test whether the
 * candidate maps the states actually visited to indistinguishable behavior.
 *
 * No finite public transcript can certify synchronization of unreachable
 * states. On a nonresettable oracle, a false candidate can still pass after
 * exploration irreversibly leaves transient states. This is an empirical
 * distinguisher and must not be advertised as a synchronization proof.
 *
 * @param {StepOnlyOracle} api
 * @param {number} [maxWordLength]
 * @param {number} [trials]
 * @returns {Promise<{word:number[]|null,steps:number,inputTape:number[]}>}
 */
async function searchSynchronizingWordDiversified(api,maxWordLength=3,trials=12) {
  if(!Number.isSafeInteger(maxWordLength)||maxWordLength<1||maxWordLength>4 ||
     !Number.isSafeInteger(trials)||trials<2||trials>64) {
    throw new RangeError('Unexpected bounded search parameters');
  }
  const candidates=binaryWords(maxWordLength);
  const suffixes=binaryWords(3);
  const scrambles=binaryWords(4);
  /** @type {number[]} */
  const inputTape=[];
  /** @param {number} symbol @returns {Promise<number>} */
  async function send(symbol) {
    inputTape.push(symbol);
    return api.step(symbol);
  }
  for(let candidateIndex=0;candidateIndex<candidates.length;candidateIndex++) {
    const candidate=candidates[candidateIndex];
    let plausible=true;
    for(let suffixIndex=0;suffixIndex<suffixes.length && plausible;suffixIndex++) {
      const suffix=suffixes[suffixIndex];
      /** @type {string|null} */
      let reference=null;
      for(let trial=0;trial<trials;trial++) {
        const scramble=scrambles[(trial*97+suffixIndex*17+candidateIndex*31)%scrambles.length];
        for(const symbol of scramble)await send(symbol);
        for(const symbol of candidate)await send(symbol);
        /** @type {number[]} */
        const observed=[];
        for(const symbol of suffix)observed.push(await send(symbol));
        const trace=JSON.stringify(observed);
        if(reference===null)reference=trace;
        else if(trace!==reference){plausible=false;break;}
      }
    }
    if(plausible)return {word:candidate,steps:inputTape.length,inputTape};
  }
  return {word:null,steps:inputTape.length,inputTape};
}

module.exports={searchSynchronizingWordDiversified};
