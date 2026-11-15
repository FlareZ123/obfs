'use strict';

const {searchSynchronizingWordDiversified}=require('./sco-sync-diversified');
const {makeVariableMachine,observableReset}=require('./sco-sync-state-size');
const {reachableStates}=require('./sco-sync-diversified-report');
const {observableStateClasses}=require('./sco-mealy-refinement');

/** @typedef {{states:number,depth:number,seedBase:string,stride:number,
 *  candidates:number,physical:number,observableContinuation:number,
 *  falseContinuation:number,steps:number}} DepthRecord */

/**
 * Compare bounded future-observation depth while holding fixed the public
 * algorithm, private machine family, and maximum candidate word length.
 * Post-attack correctness uses independent full-model state refinement.
 * Attacker calls are intentionally accounted for, never hidden as free work.
 *
 * @param {number} [count]
 * @returns {Promise<{count:number,records:DepthRecord[]}>}
 */
async function runDepthSweep(count=100){
  if(!Number.isSafeInteger(count)||count<1||count>250)throw new RangeError('count must be 1..250');
  const configurations=[
    {base:0x9ab337e1,stride:7919},
    {base:0xdeadbeef,stride:21317}
  ];
  /** @type {DepthRecord[]} */
  const records=[];
  for(const states of [6,8,12])for(const depth of [3,5,7])for(const cfg of configurations){
    /** @type {DepthRecord} */
    const record={states,depth,seedBase:'0x'+cfg.base.toString(16),stride:cfg.stride,
      candidates:0,physical:0,observableContinuation:0,falseContinuation:0,steps:0};
    for(let index=0;index<count;index++){
      const privateModel=makeVariableMachine((cfg.base+Math.imul(index,cfg.stride))>>>0,states);
      let current=0;
      const publicOracle={
        /** @param {number} symbol @returns {Promise<number>} */
        async step(symbol){
          const old=current;
          current=privateModel.next[old][symbol];
          return privateModel.output[old][symbol];
        }
      };
      const found=await searchSynchronizingWordDiversified(publicOracle,3,12,depth);
      record.steps+=found.steps;
      const word=found.word;
      if(!word)continue;
      record.candidates++;
      const all=Array.from({length:states},(_,index)=>index);
      const terminals=all.map(state=>word.reduce((s,b)=>privateModel.next[s][b],state));
      if(new Set(terminals).size===1)record.physical++;
      if(observableReset(privateModel,word,reachableStates(privateModel,current),
        observableStateClasses(privateModel)))record.observableContinuation++;
      else record.falseContinuation++;
    }
    records.push(record);
  }
  return {count,records};
}

if(require.main===module){
  runDepthSweep().then(value=>console.log(JSON.stringify(value,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={runDepthSweep};
