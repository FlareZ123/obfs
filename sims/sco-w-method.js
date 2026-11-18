'use strict';

/** @typedef {{next:number[][],output:number[][],access:number[][]}} Machine */

/**
 * Find a shortest input word that separates two states of a complete Mealy
 * hypothesis. A missing separator indicates a nonminimal hypothesis.
 * @param {Machine} machine
 * @param {number} initialLeft
 * @param {number} initialRight
 * @returns {number[]}
 */
function shortestSeparator(machine,initialLeft,initialRight) {
  const queue=[{left:initialLeft,right:initialRight,word:/** @type {number[]} */([])}];
  const visited=new Set([initialLeft+':'+initialRight]);
  for(let index=0;index<queue.length;index++){
    const {left,right,word}=queue[index];
    for(let symbol=0;symbol<machine.next[left].length;symbol++){
      const candidate=[...word,symbol];
      if(!Object.is(machine.output[left][symbol],machine.output[right][symbol]))return candidate;
      const a=machine.next[left][symbol],b=machine.next[right][symbol];
      const pair=a+':'+b;
      if(!visited.has(pair)){
        visited.add(pair);
        queue.push({left:a,right:b,word:candidate});
      }
    }
  }
  throw new Error('Hypothesis has observationally equivalent states');
}

/**
 * Characterization set for all pairs of distinct hypothesis states. Each
 * separator is found in the public hypothesis, never in the target system.
 * @param {Machine} machine
 * @returns {number[][]}
 */
function characterizationSet(machine){
  /** @type {number[][]} */
  const words=[[]];
  const seen=new Set(['[]']);
  for(let left=0;left<machine.next.length;left++){
    for(let right=left+1;right<machine.next.length;right++){
      const word=shortestSeparator(machine,left,right);
      const key=JSON.stringify(word);
      if(!seen.has(key)){seen.add(key);words.push(word);}
    }
  }
  return words;
}

/**
 * Generate words of every length up to maxLength without materializing the
 * exponentially large middle-word language in memory.
 * @param {number} maxLength
 * @param {number} alphabetSize
 * @returns {Generator<number[]>}
 */
function* middleWords(maxLength,alphabetSize){
  yield [];
  for(let length=1;length<=maxLength;length++){
    const digits=Array(length).fill(0);
    while(true){
      yield digits.slice();
      let index=length-1;
      while(index>=0 && digits[index]===alphabetSize-1){digits[index]=0;index--;}
      if(index<0)break;
      digits[index]++;
    }
  }
}

/**
 * Run a complete W-method conformance suite when the test cap permits it.
 * The only observation of the target is a public reset/replay query.
 * If all tests pass and exhaustive is true, equivalence follows under the
 * declared assumptions: deterministic complete Mealy system, effective
 * reset to one initial state, specified finite alphabet, at most maxStates
 * observable states, and a minimal complete hypothesis.
 *
 * @param {Machine} hypothesis
 * @param {number} maxStates
 * @param {(word:number[])=>Promise<number[]>} query
 * @param {number} [maxWords]
 * @returns {Promise<{passed:boolean,exhaustive:boolean,tests:number,
 *   counterexample:number[]|null,hypothesisStates:number,
 *   extensionDepth:number,characterizers:number}>}
 */
async function testWMethod(hypothesis,maxStates,query,maxWords=50000){
  const m=hypothesis.next.length;
  if(!Number.isSafeInteger(maxStates)||m<1||maxStates<m ||
     !Number.isSafeInteger(maxWords)||maxWords<1)throw new RangeError('Invalid W-method bounds');
  const alphabetSize=hypothesis.next[0].length;
  const identifiers=characterizationSet(hypothesis);
  const cover=/** @type {number[][]} */([]);
  const coverKeys=new Set();
  for(const access of hypothesis.access){
    for(const word of [access,...Array.from({length:alphabetSize},(_,a)=>[...access,a])]){
      const key=JSON.stringify(word);
      if(!coverKeys.has(key)){coverKeys.add(key);cover.push(word);}
    }
  }
  const visited=new Set();
  let tests=0;
  /** @param {number[]} word @returns {number[]} */
  function predict(word){
    let state=0;
    /** @type {number[]} */
    const outputs=[];
    for(const symbol of word){
      outputs.push(hypothesis.output[state][symbol]);
      state=hypothesis.next[state][symbol];
    }
    return outputs;
  }
  // Prefix order is deliberate: quickly expose counterexamples before the
  // full theoretical suite is exhausted, while retaining a reproducible cap.
  for(const prefix of cover){
    for(const middle of middleWords(maxStates-m,alphabetSize)){
      for(const suffix of identifiers){
        const word=[...prefix,...middle,...suffix],key=JSON.stringify(word);
        if(visited.has(key))continue;
        if(tests===maxWords)return {passed:true,exhaustive:false,tests,
          counterexample:null,hypothesisStates:m,
          extensionDepth:maxStates-m,characterizers:identifiers.length};
        visited.add(key);tests++;
        const observed=await query(word);
        const expected=predict(word);
        if(!Array.isArray(observed)||observed.length!==expected.length ||
           !observed.every((value,index)=>Object.is(value,expected[index]))){
          return {passed:false,exhaustive:false,tests,counterexample:word,
            hypothesisStates:m,extensionDepth:maxStates-m,
            characterizers:identifiers.length};
        }
      }
    }
  }
  return {passed:true,exhaustive:true,tests,counterexample:null,
    hypothesisStates:m,extensionDepth:maxStates-m,
    characterizers:identifiers.length};
}

module.exports={shortestSeparator,characterizationSet,testWMethod};
