'use strict';

const {binaryWords}=require('./sco-sync-search');
const {makeIndependentMachine}=require('./sco-sync-independent-distribution');
const {observableStateClasses}=require('./sco-mealy-refinement');
const {observableReset,terminals}=require('./sco-sync-state-size');
const {reachableStates}=require('./sco-sync-diversified-report');

/** @typedef {{next:number[][],output:number[][]}} Machine */
/** @typedef {{physical:boolean,globalObservable:boolean,initialObservable:boolean}} Existence */
/** @typedef {{states:number,models:number,physical:number,globalObservable:number,initialObservable:number}} AvailabilityRecord */

/**
 * Full-model evaluator of whether ANY binary word of lengths 1..maxLength
 * synchronizes the given Mealy machine. This function deliberately inspects
 * private transitions and must never be called by a public-only attacker.
 * It labels the ground-truth opportunity set against which the previously
 * published chosen-input search can be evaluated for missed opportunities.
 *
 * @param {Machine} machine
 * @param {number} [maxLength]
 * @returns {Existence}
 */
function classifyShortResetOpportunity(machine,maxLength=3){
  const words=binaryWords(maxLength);
  const all=Array.from({length:machine.next.length},(_,i)=>i);
  const initial=reachableStates(machine,0);
  const classes=observableStateClasses(machine);
  return {
    physical:words.some(word=>new Set(terminals(machine,word,all)).size===1),
    globalObservable:words.some(word=>observableReset(machine,word,all,classes)),
    initialObservable:words.some(word=>observableReset(machine,word,initial,classes))
  };
}

/**
 * Count all short reset opportunities independently of public attacker output.
 * The four public seed streams match the SHA-256 independent distribution
 * challenge, each with count distinct models at each hidden-state size.
 * Enumeration concerns words of length <=3 only. An attack bound of three
 * symbols cannot rule out longer reset words or arbitrary future behavior.
 *
 * @param {number} [count]
 * @returns {{count:number,records:AvailabilityRecord[]}}
 */
function runGroundTruthSweep(count=100){
  if(!Number.isSafeInteger(count)||count<1||count>250)throw new RangeError('count must be 1..250');
  const streams=[
    {base:0xa82b11f5,stride:4973},
    {base:0x4d90e2c7,stride:14057},
    {base:0x51a9c603,stride:8467},
    {base:0x7e2df0b1,stride:12289}
  ];
  /** @type {AvailabilityRecord[]} */
  const records=[];
  for(const states of [4,8,12]){
    /** @type {AvailabilityRecord} */
    const record={states,models:0,physical:0,globalObservable:0,initialObservable:0};
    for(const stream of streams)for(let index=0;index<count;index++){
      const model=makeIndependentMachine((stream.base+Math.imul(index,stream.stride))>>>0,states);
      const existence=classifyShortResetOpportunity(model);
      record.models++;
      if(existence.physical)record.physical++;
      if(existence.globalObservable)record.globalObservable++;
      if(existence.initialObservable)record.initialObservable++;
    }
    records.push(record);
  }
  return {count,records};
}

if(require.main===module){
  console.log(JSON.stringify(runGroundTruthSweep(process.argv.includes('--quick')?40:100),null,2));
}

module.exports={classifyShortResetOpportunity,runGroundTruthSweep};
