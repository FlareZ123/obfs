'use strict';

/** @typedef {{step:(symbol:number)=>Promise<number>}} StepOnlyOracle */

/**
 * Enumerate binary nonempty words in breadth-first order.
 * @param {number} maxLength
 * @returns {number[][]}
 */
function binaryWords(maxLength) {
  /** @type {number[][]} */
  const all=[];
  /** @type {number[][]} */
  let layer=[[]];
  for(let length=1;length<=maxLength;length++) {
    /** @type {number[][]} */
    const next=[];
    for(const prefix of layer)for(let symbol=0;symbol<2;symbol++) {
      const word=[...prefix,symbol];
      next.push(word);
      all.push(word);
    }
    layer=next;
  }
  return all;
}

/**
 * Small-state **heuristic** chosen-input synchronizing-word search.
 *
 * Repeatedly scramble the unknown state with symbol 1, play a candidate
 * synchronizing word, then measure post-candidate output traces. Reject a
 * candidate if any repeated trace differs. This is an observational
 * consistency filter, NOT a general DFA synchronizability proof. It may
 * false-positive on indistinguishable states, unreachable states, insufficient
 * scramble coverage or unobserved distinguishing words.
 *
 * The intended target family has four reachable states, a cyclic symbol-1
 * transition and a short symbol-0 synchronizing word. The attacker is given
 * only the public step operation and a word-length bound, not the model.
 *
 * @param {StepOnlyOracle} api
 * @param {number} [maxWordLength]
 * @param {number} [trials]
 * @returns {Promise<{word:number[]|null,steps:number,inputTape:number[]}>}
 */
async function searchSynchronizingWord(api,maxWordLength=3,trials=6) {
  if(!Number.isSafeInteger(maxWordLength)||maxWordLength<1||maxWordLength>4 ||
      !Number.isSafeInteger(trials)||trials<2||trials>32) {
    throw new RangeError('Unexpected bounded search parameters');
  }
  const words=binaryWords(maxWordLength);
  const suffixes=binaryWords(3);
  /** @type {number[]} */
  const inputTape=[];
  /** @param {number} symbol @returns {Promise<number>} */
  async function send(symbol) {
    inputTape.push(symbol);
    return api.step(symbol);
  }
  for(const word of words) {
    let plausible=true;
    for(const suffix of suffixes) {
      /** @type {string|null} */
      let expected=null;
      for(let trial=0;trial<trials;trial++) {
        for(let noise=0;noise<1+(trial%4);noise++)await send(1);
        for(const symbol of word)await send(symbol);
        const observed=[];
        for(const symbol of suffix)observed.push(await send(symbol));
        const key=JSON.stringify(observed);
        if(expected===null) expected=key;
        else if(key!==expected) {
          plausible=false;
          break;
        }
      }
      if(!plausible)break;
    }
    if(plausible)return {word,steps:inputTape.length,inputTape};
  }
  return {word:null,steps:inputTape.length,inputTape};
}

module.exports={binaryWords,searchSynchronizingWord};
