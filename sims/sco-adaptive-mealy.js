'use strict';

const {performance}=require('node:perf_hooks');

/** @typedef {{reset:()=>Promise<boolean>,step:(symbol:number)=>Promise<number>}} Oracle */
/** @typedef {{next:number[][],output:number[][],access:number[][]}} LearnedMachine */

/**
 * Query-only active Mealy inference with a finite conformance budget.
 * The attacker uses public reset/step calls and never inspects hidden state.
 * The resulting machine is empirical: bounded queries are not an equivalence proof.
 *
 * @param {Oracle} api
 * @param {{maxStates?:number,alphabetSize?:number,conformanceDepth?:number,
 *   randomProbes?:number,seed?:number}} [options]
 * @returns {Promise<{machine:LearnedMachine,requests:number,steps:number,
 *   conformanceQueries:number,counterexamples:number,experiments:number,
 *   trainingWords:string[],conformancePassed:boolean,elapsedMs:number}>}
 */
async function learnAdaptiveMealy(api, options={}) {
  const started=performance.now();
  const {maxStates=12,alphabetSize=2,conformanceDepth=6,
    randomProbes=320,seed=0x715c317}=options;
  if(!Number.isSafeInteger(maxStates)||maxStates<2||maxStates>32 ||
     !Number.isSafeInteger(alphabetSize)||alphabetSize<1||alphabetSize>4 ||
     !Number.isSafeInteger(conformanceDepth)||conformanceDepth<1||conformanceDepth>10 ||
     !Number.isSafeInteger(randomProbes)||randomProbes<0||randomProbes>4000) {
    throw new RangeError('Unsupported active-learning bounds');
  }
  /** @type {number[][]} */
  const access=[[]];
  /** @type {number[][]} */
  const experiments=Array.from({length:alphabetSize},(_,symbol)=>[symbol]);
  /** @type {Map<string,number[]>} */
  const observations=new Map();
  /** @type {Set<string>} */
  const training=new Set();
  let requests=0,steps=0,conformanceQueries=0,counterexamples=0;
  /** @param {number[]} word @returns {Promise<number[]>} */
  async function trace(word) {
    const key=JSON.stringify(word);
    const saved=observations.get(key);
    if(saved!==undefined)return saved;
    requests++;
    if(await api.reset()!==true)throw new Error('Public reset rejected');
    /** @type {number[]} */
    const values=[];
    for(const symbol of word){values.push(await api.step(symbol));steps++;}
    observations.set(key,values);
    for(let length=1;length<=word.length;length++)training.add(JSON.stringify(word.slice(0,length)));
    return values;
  }
  /** @param {number[]} prefix @param {number[]} suffix @returns {Promise<number[]>} */
  async function suffixTrace(prefix,suffix) {
    const values=await trace([...prefix,...suffix]);
    return values.slice(prefix.length);
  }
  /** @param {number[]} prefix @returns {Promise<string>} */
  async function row(prefix){
    /** @type {number[][]} */
    const values=[];
    for(const suffix of experiments)values.push(await suffixTrace(prefix,suffix));
    return JSON.stringify(values);
  }
  /** @returns {Promise<boolean>} */
  async function settle(){
    for(let pass=0;pass<maxStates*maxStates*4;pass++){
      /** @type {Map<string,number>} */
      const rows=new Map();
      for(let index=0;index<access.length;index++)rows.set(await row(access[index]),index);
      let added=false;
      for(const prefix of access){
        for(let symbol=0;symbol<alphabetSize;symbol++){
          const next=[...prefix,symbol], signature=await row(next);
          if(!rows.has(signature)){
            if(access.length>=maxStates)return false;
            access.push(next);rows.set(signature,access.length-1);added=true;break;
          }
        }
        if(added)break;
      }
      if(added)continue;
      /** @type {number[]|null} */
      let newExperiment=null;
      for(let i=0;i<access.length&&!newExperiment;i++)for(let j=i+1;j<access.length&&!newExperiment;j++){
        if(await row(access[i])!==await row(access[j]))continue;
        for(let symbol=0;symbol<alphabetSize;symbol++){
          const l=[...access[i],symbol],r=[...access[j],symbol];
          for(const suffix of experiments){
            if(JSON.stringify(await suffixTrace(l,suffix))!==
               JSON.stringify(await suffixTrace(r,suffix))){
              newExperiment=[symbol,...suffix];break;
            }
          }
          if(newExperiment)break;
        }
      }
      if(newExperiment){
        if(!experiments.some(e=>JSON.stringify(e)===JSON.stringify(newExperiment))) {
          experiments.push(newExperiment);continue;
        }
        throw new Error('Unproductive consistency refinement');
      }
      return true;
    }
    throw new Error('Conformance table did not settle');
  }
  /** @returns {Promise<LearnedMachine>} */
  async function hypothesis(){
    const signatures=await Promise.all(access.map(row));
    const unique=[...new Set(signatures)];
    const reps=unique.map(signature=>access[signatures.indexOf(signature)]);
    /** @type {number[][]} */
    const next=[],output=[];
    for(const prefix of reps){
      /** @type {number[]} */
      const successors=[],values=[];
      for(let symbol=0;symbol<alphabetSize;symbol++){
        const successor=unique.indexOf(await row([...prefix,symbol]));
        if(successor<0)throw new Error('Unclosed table');
        successors.push(successor);
        values.push((await suffixTrace(prefix,[symbol]))[0]);
      }
      next.push(successors);output.push(values);
    }
    return {next,output,access:reps};
  }
  /** @param {LearnedMachine} machine @param {number[]} word @returns {number[]} */
  function simulate(machine,word){
    let state=0;
    /** @type {number[]} */
    const outputs=[];
    for(const symbol of word){
      outputs.push(machine.output[state][symbol]);
      state=machine.next[state][symbol];
    }
    return outputs;
  }
  /** @type {number[][]} */
  const conformance=[];
  /** @type {number[][]} */
  let frontier=[[]];
  for(let depth=1;depth<=conformanceDepth;depth++){
    /** @type {number[][]} */
    const layer=[];
    for(const prefix of frontier)for(let symbol=0;symbol<alphabetSize;symbol++){
      const word=[...prefix,symbol];layer.push(word);conformance.push(word);
    }
    frontier=layer;
  }
  let random=seed>>>0;
  for(let i=0;i<randomProbes;i++){
    random=(Math.imul(random,1664525)+1013904223)>>>0;
    const length=1+((random>>>16)%Math.max(2,maxStates*3));
    /** @type {number[]} */
    const word=[];
    for(let j=0;j<length;j++){
      random=(Math.imul(random,1664525)+1013904223)>>>0;
      word.push((random>>>16)%alphabetSize);
    }
    conformance.push(word);
  }
  /** @returns {number} */
  function elapsed(){return Number((performance.now()-started).toFixed(3));}
  /** @type {LearnedMachine} */
  let machine={next:[],output:[],access:[]};
  for(let round=0;round<maxStates*3;round++){
    if(!await settle())return {machine,requests,steps,conformanceQueries,
      counterexamples,experiments:experiments.length,trainingWords:[...training],conformancePassed:false,elapsedMs:elapsed()};
    machine=await hypothesis();
    let witness=null;
    for(const word of conformance){
      conformanceQueries++;
      if(JSON.stringify(await trace(word))!==JSON.stringify(simulate(machine,word))){
        witness=word;break;
      }
    }
    if(witness===null)return {machine,requests,steps,conformanceQueries,
      counterexamples,experiments:experiments.length,trainingWords:[...training],conformancePassed:true,elapsedMs:elapsed()};
    counterexamples++;
    let grew=false;
    for(let index=0;index<witness.length;index++){
      const suffix=witness.slice(index);
      if(!experiments.some(e=>JSON.stringify(e)===JSON.stringify(suffix))){
        experiments.push(suffix);grew=true;
      }
    }
    if(!grew)throw new Error('Conformance witness did not refine experiment set');
  }
  return {machine,requests,steps,conformanceQueries,counterexamples,
    experiments:experiments.length,trainingWords:[...training],conformancePassed:false,elapsedMs:elapsed()};
}

module.exports={learnAdaptiveMealy};
