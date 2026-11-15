'use strict';

const {searchSynchronizingWordDiversified}=require('./sco-sync-diversified');
const {reachableStates}=require('./sco-sync-diversified-report');
const {observableStateClasses}=require('./sco-mealy-refinement');

/** @typedef {{next:number[][],output:number[][]}} Machine */

/**
 * Generate a deterministic binary-input/binary-output Mealy machine with a
 * prescribed number of hidden states. This extends the original four-state
 * fixture generator without informing the public attack of the state count.
 * @param {number} seed
 * @param {number} states
 * @returns {Machine}
 */
function makeVariableMachine(seed,states){
  let value=seed>>>0;
  /** @returns {number} */
  function random(){
    value=(Math.imul(value,1664525)+1013904223)>>>0;
    return value>>>16;
  }
  return {
    next:Array.from({length:states},()=>[random()%states,random()%states]),
    output:Array.from({length:states},()=>[random()%2,random()%2])
  };
}

/**
 * @param {Machine} machine
 * @param {readonly number[]} word
 * @param {readonly number[]} origins
 * @returns {number[]}
 */
function terminals(machine,word,origins){
  return origins.map(initial=>word.reduce((state,symbol)=>machine.next[state][symbol],initial));
}

/**
 * Decide whether the proposed word maps every origin to equivalent behavior.
 * This post-attack classifier uses the *full model* through fixed-point
 * refinement. The public attacker never receives these classes.
 * @param {Machine} machine
 * @param {readonly number[]} word
 * @param {readonly number[]} origins
 * @param {readonly number[]} classes
 * @returns {boolean}
 */
function observableReset(machine,word,origins,classes){
  const destination=terminals(machine,word,origins);
  return destination.every(state=>classes[state]===classes[destination[0]]);
}

/**
 * @typedef {{states:number,seedBase:string,stride:number,
 *   candidates:number,physical:number,globalObservable:number,
 *   initialObservable:number,continuationObservable:number,
 *   falseContinuation:number,steps:number}} SweepRecord
 */

/**
 * Test the *same* fixed attacker over distinct hidden-state cardinalities.
 * Distinct seed/stride streams prevent one four-state fixture family from
 * silently defining all outcomes. This is finite empirical evidence, not a
 * proof that growing server state is a general obfuscation technique.
 *
 * @param {number} [count]
 * @returns {Promise<{count:number,groups:SweepRecord[]}>}
 */
async function runSizeSweep(count=250){
  if(!Number.isSafeInteger(count)||count<1||count>1000)throw new RangeError('count must be 1..1000');
  const seeds=[
    {base:0x9ab337e1,stride:7919},
    {base:0xdeadbeef,stride:21317}
  ];
  /** @type {SweepRecord[]} */
  const groups=[];
  for(const states of [4,6,8,12]){
    for(const seed of seeds){
      /** @type {SweepRecord} */
      const record={states,seedBase:'0x'+seed.base.toString(16),stride:seed.stride,
        candidates:0,physical:0,globalObservable:0,initialObservable:0,
        continuationObservable:0,falseContinuation:0,steps:0};
      for(let index=0;index<count;index++){
        const machine=makeVariableMachine((seed.base+Math.imul(index,seed.stride))>>>0,states);
        let current=0;
        const api={
          /** @param {number} symbol @returns {Promise<number>} */
          async step(symbol){
            const old=current;
            current=machine.next[old][symbol];
            return machine.output[old][symbol];
          }
        };
        const found=await searchSynchronizingWordDiversified(api,3,12);
        record.steps+=found.steps;
        if(!found.word)continue;
        record.candidates++;
        const word=found.word;
        const all=Array.from({length:states},(_,i)=>i);
        const privateClasses=observableStateClasses(machine);
        if(new Set(terminals(machine,word,all)).size===1)record.physical++;
        if(observableReset(machine,word,all,privateClasses))record.globalObservable++;
        if(observableReset(machine,word,reachableStates(machine,0),privateClasses))
          record.initialObservable++;
        if(observableReset(machine,word,reachableStates(machine,current),privateClasses))
          record.continuationObservable++;
        else record.falseContinuation++;
      }
      groups.push(record);
    }
  }
  return {count,groups};
}

if(require.main===module){
  runSizeSweep(process.argv.includes('--stress')?1000:250)
    .then(value=>console.log(JSON.stringify(value,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={makeVariableMachine,terminals,observableReset,runSizeSweep};
