'use strict';

const {binaryWords,searchSynchronizingWord}=require('./sco-sync-search');
const {makeGeneralMachine,actuallySynchronizes}=require('./sco-sync-search-falsification');
const {searchSynchronizingWordDiversified}=require('./sco-sync-diversified');

/** @typedef {{next:number[][],output:number[][]}} Machine */
/** @typedef {{step:(symbol:number)=>Promise<number>}} StepOnlyOracle */
/** @typedef {(api:StepOnlyOracle,maxWordLength?:number,trials?:number)=>Promise<{word:number[]|null,steps:number,inputTape:number[]}>} Search */

/**
 * Complete reachable-state set of this fixed finite-state fixture.
 * @param {Machine} model
 * @param {number} initial
 * @returns {number[]}
 */
function reachableStates(model,initial) {
  const reachable=new Set([initial]);
  for(let round=0;round<model.next.length;round++) {
    for(const state of [...reachable])for(const next of model.next[state])reachable.add(next);
  }
  return [...reachable];
}

/**
 * Trace outputs without revealing transitions to the attacker.
 * @param {Machine} model
 * @param {number} initial
 * @param {readonly number[]} inputs
 * @returns {string}
 */
function outputTrace(model,initial,inputs) {
  let state=initial;
  /** @type {number[]} */
  const outputs=[];
  for(const symbol of inputs){
    outputs.push(model.output[state][symbol]);
    state=model.next[state][symbol];
  }
  return JSON.stringify(outputs);
}

/**
 * Exact observational synchronization on the chosen start-state set for a
 * four-state deterministic binary Mealy fixture. Suffixes of at most three
 * symbols distinguish every inequivalent state in a <=4-state machine.
 * Only the post-attack evaluator uses the private model.
 * @param {Machine} model
 * @param {readonly number[]} word
 * @param {readonly number[]} initialStates
 * @returns {boolean}
 */
function observationallySynchronizes(model,word,initialStates) {
  const terminals=initialStates.map(initial=>word.reduce((state,symbol)=>model.next[state][symbol],initial));
  for(const suffix of binaryWords(3)) {
    const reference=outputTrace(model,terminals[0],suffix);
    if(terminals.some(state=>outputTrace(model,state,suffix)!==reference))return false;
  }
  return true;
}

/**
 * @param {Machine} model
 * @param {Search} search
 * @param {number} [trials]
 * @returns {Promise<{word:number[]|null,steps:number,physical:boolean,globalObservable:boolean,
 *   initialObservable:boolean,continuationObservable:boolean}>}
 */
async function evaluateSearch(model,search,trials=6) {
  let state=0,operations=0;
  const api={
    /** @param {number} symbol @returns {Promise<number>} */
    async step(symbol){
      operations++;
      const previous=state;
      state=model.next[previous][symbol];
      return model.output[previous][symbol];
    }
  };
  const found=await search(api,3,trials);
  if(found.steps!==operations || found.inputTape.length!==operations) {
    throw new Error('Discovery step accounting disagrees with oracle');
  }
  const word=found.word;
  if(!word)return {word:null,steps:operations,physical:false,
    globalObservable:false,initialObservable:false,continuationObservable:false};
  const all=[0,1,2,3];
  return {word,steps:operations,
    physical:actuallySynchronizes(model,word),
    globalObservable:observationallySynchronizes(model,word,all),
    initialObservable:observationallySynchronizes(model,word,reachableStates(model,0)),
    continuationObservable:observationallySynchronizes(model,word,reachableStates(model,state))};
}

/**
 * @param {Search} search
 * @param {number} count
 * @param {number} seedBase
 * @param {number} seedStride
 * @param {number} trials
 * @returns {Promise<{proposed:number,physical:number,globalObservable:number,initialObservable:number,
 *   continuationObservable:number,falseContinuation:number,steps:number}>}
 */
async function summarize(search,count,seedBase,seedStride,trials){
  const totals={proposed:0,physical:0,globalObservable:0,initialObservable:0,
    continuationObservable:0,falseContinuation:0,steps:0};
  for(let index=0;index<count;index++){
    const model=makeGeneralMachine((seedBase+Math.imul(index,seedStride))>>>0);
    const item=await evaluateSearch(model,search,trials);
    totals.steps+=item.steps;
    if(item.word){
      totals.proposed++;
      if(item.physical)totals.physical++;
      if(item.globalObservable)totals.globalObservable++;
      if(item.initialObservable)totals.initialObservable++;
      if(item.continuationObservable)totals.continuationObservable++;
      else totals.falseContinuation++;
    }
  }
  return totals;
}

/**
 * Compare original and diversified public-step-only attacks on two
 * deterministic fixture distributions, with private tables used only in
 * the post-attack evaluator.
 * @param {number} [count]
 * @param {boolean} [holdout]
 * @returns {Promise<{count:number,corpora:{seedBase:string,seedStride:number,
 *   original:Awaited<ReturnType<typeof summarize>>,
 *   diversified:Awaited<ReturnType<typeof summarize>>}[]}>}
 */
async function runComparison(count=250,holdout=false){
  if(!Number.isSafeInteger(count)||count<1||count>1000)throw new RangeError('count 1..1000');
  // Held-out seeds were chosen independently of the original two corpora.
  const configurations=holdout ? [
    {seedBase:0xdeadbeef,seedStride:21317},
    {seedBase:0x13579bdf,seedStride:4567}
  ] : [
    {seedBase:0x9ab337e1,seedStride:7919},
    {seedBase:0x6ca2de94,seedStride:10309}
  ];
  /** @type {{seedBase:string,seedStride:number,
   *   original:Awaited<ReturnType<typeof summarize>>,
   *   diversified:Awaited<ReturnType<typeof summarize>>}[]} */
  const corpora=[];
  for(const config of configurations){
    const original=await summarize(searchSynchronizingWord,count,config.seedBase,config.seedStride,6);
    const diversified=await summarize(searchSynchronizingWordDiversified,count,config.seedBase,config.seedStride,12);
    corpora.push({seedBase:'0x'+config.seedBase.toString(16),seedStride:config.seedStride,
      original,diversified});
  }
  return {count,corpora};
}

if(require.main===module){
  runComparison(process.argv.includes('--stress')?1000:250,process.argv.includes('--holdout'))
    .then(value=>console.log(JSON.stringify(value,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={reachableStates,observationallySynchronizes,evaluateSearch,runComparison};
