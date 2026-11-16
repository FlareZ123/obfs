'use strict';

const {createHash}=require('node:crypto');
const {searchSynchronizingWordDiversified}=require('./sco-sync-diversified');
const {reachableStates}=require('./sco-sync-diversified-report');
const {observableStateClasses}=require('./sco-mealy-refinement');
const {observableReset,terminals}=require('./sco-sync-state-size');

/** @typedef {{next:number[][],output:number[][]}} Machine */
/** @typedef {{word:number[]|null,steps:number,physical:boolean,observable:boolean,continuation:boolean}} AttackRecord */
/** @typedef {{states:number,depth:number,seedBase:string,stride:number,count:number,candidates:number,physical:number,observable:number,continuation:number,falseContinuation:number,steps:number}} GroupRecord */

/**
 * Rejection-sampled deterministic SHA-256 draw for reproducible, nearly
 * independent transition/output tables. Every state, symbol, and field has a
 * separate domain. The seed is public; this is a test fixture, not a secret.
 * The rejection step avoids a modulo bias that can distort small alphabets.
 *
 * @param {string} label
 * @param {number} limit
 * @returns {number}
 */
function fixtureDraw(label,limit){
  const ceiling=Math.floor(0x100000000/limit)*limit;
  for(let counter=0;;counter++){
    const digest=createHash('sha256').update('obfs-sha-mealy-v1:')
      .update(label).update(':').update(String(counter)).digest();
    const sample=digest.readUInt32BE(0);
    if(sample<ceiling)return sample%limit;
  }
}

/**
 * Construct a reproducible uniform-table binary Mealy fixture independent of
 * the earlier LCG generator. Distinct field domain tags prevent accidental
 * dependence between transitions and observations. These are original
 * attacker-evaluation fixtures, not an implementation of production SCO.
 *
 * @param {number} seed Unsigned 32-bit experiment seed.
 * @param {number} states Number of hidden states.
 * @returns {Machine}
 */
function makeIndependentMachine(seed,states){
  if(!Number.isSafeInteger(states)||states<2||states>64 ||
      !Number.isSafeInteger(seed)||seed<0||seed>0xffffffff){
    throw new RangeError('Expected unsigned 32-bit seed and 2..64 states');
  }
  const prefix=seed.toString(16)+':'+states+':';
  const next=Array.from({length:states},(_,state)=>
    Array.from({length:2},(_,symbol)=>
      fixtureDraw(prefix+state+':'+symbol+':next',states)));
  const output=Array.from({length:states},(_,state)=>
    Array.from({length:2},(_,symbol)=>
      fixtureDraw(prefix+state+':'+symbol+':output',2)));
  return {next,output};
}

/**
 * Exercise only the public step callback during discovery, then use the full
 * model exclusively for post-attack classification. The check classifies
 * observational state equivalence by independent partition refinement.
 *
 * @param {Machine} machine
 * @param {number} depth
 * @returns {Promise<AttackRecord>}
 */
async function evaluateIndependentMachine(machine,depth){
  let current=0;
  let calls=0;
  const api={
    /** @param {number} symbol @returns {Promise<number>} */
    async step(symbol){
      calls++;
      const previous=current;
      current=machine.next[previous][symbol];
      return machine.output[previous][symbol];
    }
  };
  const found=await searchSynchronizingWordDiversified(api,3,12,depth);
  if(calls!==found.steps || calls!==found.inputTape.length){
    throw new Error('Attacker step count disagrees with observed step calls');
  }
  if(!found.word)return {word:null,steps:calls,physical:false,observable:false,continuation:false};
  const all=Array.from({length:machine.next.length},(_,state)=>state);
  const classes=observableStateClasses(machine);
  return {
    word:found.word,
    steps:calls,
    physical:new Set(terminals(machine,found.word,all)).size===1,
    observable:observableReset(machine,found.word,all,classes),
    continuation:observableReset(machine,found.word,reachableStates(machine,current),classes)
  };
}

/**
 * Compare the exact same published depth-3/depth-5 public attacker on a new
 * SHA-256 fixture family. No state labels are disclosed to the attacker.
 * Each depth starts a fresh instance at private state zero. Outcomes may be
 * false positives because finite chosen-input traces cannot prove global
 * convergence on a nonresettable black box.
 *
 * @param {number} [count]
 * @param {boolean} [holdout]
 * @returns {Promise<{count:number,holdout:boolean,groups:GroupRecord[]}>}
 */
async function runIndependentSweep(count=40,holdout=false){
  if(!Number.isSafeInteger(count)||count<1||count>250)throw new RangeError('count must be 1..250');
  const seeds=holdout ? [
    {base:0x51a9c603,stride:8467},
    {base:0x7e2df0b1,stride:12289}
  ] : [
    {base:0xa82b11f5,stride:4973},
    {base:0x4d90e2c7,stride:14057}
  ];
  /** @type {GroupRecord[]} */
  const groups=[];
  for(const states of [4,8,12])for(const seed of seeds)for(const depth of [3,5]){
    /** @type {GroupRecord} */
    const record={states,depth,seedBase:'0x'+seed.base.toString(16),stride:seed.stride,
      count,candidates:0,physical:0,observable:0,continuation:0,falseContinuation:0,steps:0};
    for(let index=0;index<count;index++){
      const machine=makeIndependentMachine((seed.base+Math.imul(index,seed.stride))>>>0,states);
      const item=await evaluateIndependentMachine(machine,depth);
      record.steps+=item.steps;
      if(item.word){
        record.candidates++;
        if(item.physical)record.physical++;
        if(item.observable)record.observable++;
        if(item.continuation)record.continuation++;
        else record.falseContinuation++;
      }
    }
    groups.push(record);
  }
  return {count,holdout,groups};
}

if(require.main===module){
  const stress=process.argv.includes('--stress');
  runIndependentSweep(stress?100:40,process.argv.includes('--holdout'))
    .then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={makeIndependentMachine,evaluateIndependentMachine,runIndependentSweep};
