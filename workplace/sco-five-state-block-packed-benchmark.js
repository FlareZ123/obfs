'use strict';

// Exploratory benchmark: fixed-size blocks hold one-byte or two-byte candidate
// entries, while a sparse list stores only nonempty block IDs and counts.

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {
  FIVE_STATE_MODEL_COUNT,
  generateCanonicalTransitions
}=require('../sims/sco-step-only-five-state');
const {makeIndependentMachine}=require('../sims/sco-sync-independent-distribution');
const {observableStateClasses}=require('../sims/sco-mealy-refinement');

/**
 * @typedef {{
 *   states:number,
 *   start:number,
 *   end:number,
 *   outputBits:number,
 *   outputMask:number,
 *   transitions:Uint8Array
 * }} BlockPackedRange
 */

/**
 * @typedef {{
 *   ranges:BlockPackedRange[],
 *   entries:Uint8Array|Uint16Array,
 *   activeBlocks:Uint32Array,
 *   modelCount:number,
 *   activeBlockCount:number,
 *   blockSize:number,
 *   localBits:number,
 *   localMask:number,
 *   countBits:number,
 *   countMask:number,
 *   candidateBytes:number,
 *   initializationMs:number,
 *   reset:()=>number
 * }} BlockPackedWorkspace
 */

/**
 * @typedef {{step:(symbol:0|1)=>Promise<0|1>}} StepApi
 */

/**
 * @typedef {{
 *   next:number[][],
 *   output:number[][],
 *   state:number
 * }} Machine
 */

/**
 * Build a five-state canonical hypothesis workspace with sparse active blocks.
 *
 * Each candidate entry stores its local model ID and current state. The block
 * ID is implicit in the fixed-size segment; activeBlocks stores packed
 * (blockId,count) words for nonempty segments only.
 *
 * @param {number} [blockSize=32]
 * @returns {BlockPackedWorkspace}
 */
function createWorkspace(blockSize=32){
  if(!Number.isInteger(blockSize)||blockSize<32||blockSize>8192||
    (blockSize&(blockSize-1))!==0)
    throw new RangeError('blockSize must be a power of two from 32 through 8192');
  const started=performance.now();
  const ranges=[];
  let offset=0;
  for(let states=1;states<=5;states++){
    const generated=generateCanonicalTransitions(states);
    const outputBits=2*states;
    const outputCount=1<<outputBits;
    const count=generated.count*outputCount;
    ranges.push({
      states,start:offset,end:offset+count,outputBits,
      outputMask:outputCount-1,transitions:generated.transitions
    });
    offset+=count;
  }
  assert.equal(offset,FIVE_STATE_MODEL_COUNT);
  const localBits=Math.log2(blockSize);
  const countBits=localBits+1;
  const localMask=blockSize-1;
  const countMask=(1<<countBits)-1;
  const blockCount=Math.ceil(offset/blockSize);
  const EntryArray=localBits+3<=8?Uint8Array:Uint16Array;
  const entries=new EntryArray(offset);
  const activeBlocks=new Uint32Array(blockCount);
  const template=new EntryArray(blockSize);
  for(let local=0;local<blockSize;local++)template[local]=local;

  /**
   * Restore every candidate in canonical ID order, at initial state zero.
   * @returns {number}
   */
  function reset(){
    let activeBlockCount=0;
    for(let block=0;block<blockCount;block++){
      const base=block*blockSize;
      const length=Math.min(blockSize,offset-base);
      entries.set(template.subarray(0,length),base);
      activeBlocks[activeBlockCount++]=(block<<countBits)|length;
    }
    return activeBlockCount;
  }

  const activeBlockCount=reset();
  return {
    ranges,entries,activeBlocks,modelCount:offset,activeBlockCount,
    blockSize,localBits,localMask,countBits,countMask,
    candidateBytes:entries.byteLength+activeBlocks.byteLength,
    initializationMs:Number((performance.now()-started).toFixed(3)),
    reset
  };
}

/**
 * Resolve a global model ID and current state into its transition descriptor.
 * @param {number} id
 * @param {number} state
 * @param {BlockPackedRange[]} ranges
 * @returns {{range:BlockPackedRange,graphOffset:number,outputMask:number,state:number}}
 */
function descriptor(id,state,ranges){
  for(const range of ranges){
    if(id<range.end){
      const local=id-range.start;
      const graphIndex=local>>>range.outputBits;
      return {
        range,graphOffset:graphIndex*2*range.states,
        outputMask:local&range.outputMask,state
      };
    }
  }
  throw new RangeError('Unknown canonical model ID');
}

/**
 * Find the first input symbol of a distinguishing continuation.
 * @param {{range:BlockPackedRange,graphOffset:number,outputMask:number,state:number}} left
 * @param {{range:BlockPackedRange,graphOffset:number,outputMask:number,state:number}} right
 * @param {{productPairs:number}} metrics
 * @returns {0|1|null}
 */
function firstDistinguishingSymbol(left,right,metrics){
  const start=left.state*5+right.state;
  const queue=new Uint8Array(25);
  const first=new Int8Array(25);
  first.fill(-1);
  let head=0,tail=0,seen=1<<start;
  queue[tail++]=start;
  while(head<tail){
    const pair=queue[head++];
    metrics.productPairs++;
    const leftState=Math.floor(pair/5);
    const rightState=pair%5;
    for(let symbol=0;symbol<2;symbol++){
      const leftPair=leftState*2+symbol;
      const rightPair=rightState*2+symbol;
      if(((left.outputMask>>>leftPair)&1)!==((right.outputMask>>>rightPair)&1))
        return /** @type {0|1} */ (first[pair]===-1?symbol:first[pair]);
      const leftNext=left.range.transitions[left.graphOffset+leftPair];
      const rightNext=right.range.transitions[right.graphOffset+rightPair];
      const nextPair=leftNext*5+rightNext;
      const bit=1<<nextPair;
      if((seen&bit)===0){
        seen|=bit;
        first[nextPair]=first[pair]===-1?symbol:first[pair];
        queue[tail++]=nextPair;
      }
    }
  }
  return null;
}

/**
 * Materialize a certificate machine from a descriptor.
 * @param {{range:BlockPackedRange,graphOffset:number,outputMask:number,state:number}} value
 * @returns {Machine}
 */
function decodeCandidate(value){
  const {range,graphOffset,outputMask,state}=value;
  const next=Array.from({length:range.states},()=>[0,0]);
  const output=Array.from({length:range.states},()=>[0,0]);
  for(let source=0;source<range.states;source++){
    for(let symbol=0;symbol<2;symbol++){
      const pair=source*2+symbol;
      next[source][symbol]=range.transitions[graphOffset+pair];
      output[source][symbol]=(outputMask>>>pair)&1;
    }
  }
  return {next,output,state};
}

/**
 * Learn a bounded continuation from a no-reset binary step oracle.
 *
 * @param {StepApi} api
 * @param {BlockPackedWorkspace} workspace
 * @param {number} [maxQueries=128]
 * @returns {Promise<{
 *   certified:boolean,queries:number,remaining:number,inputs:number[],outputs:number[],
 *   clone:Machine|null,scanWork:number,equivalenceChecks:number,productPairs:number,
 *   resetMs:number,elapsedMs:number
 * }>}
 */
async function learn(api,workspace,maxQueries=128){
  const {
    ranges,entries,activeBlocks,blockSize,localBits,localMask,countBits,countMask
  }=workspace;
  const resetStarted=performance.now();
  let activeBlockCount=workspace.reset();
  const resetMs=Number((performance.now()-resetStarted).toFixed(3));
  let count=workspace.modelCount;
  const started=performance.now();
  let queries=0,scanWork=0,equivalenceChecks=0,productPairs=0;
  const inputs=[],outputs=[];

  for(let query=0;query<=maxQueries;query++){
    let ones0=0,ones1=0,rangeIndex=0;
    for(let blockPosition=0;blockPosition<activeBlockCount;blockPosition++){
      const packed=activeBlocks[blockPosition];
      const block=packed>>>countBits;
      const length=packed&countMask;
      const base=block*blockSize;
      for(let position=0;position<length;position++){
        const entry=entries[base+position];
        const localId=entry&localMask;
        const state=entry>>>localBits;
        const id=base+localId;
        while(id>=ranges[rangeIndex].end)rangeIndex++;
        const range=ranges[rangeIndex];
        const local=id-range.start;
        const outputMask=local&range.outputMask;
        ones0+=(outputMask>>>(state*2))&1;
        ones1+=(outputMask>>>(state*2+1))&1;
      }
    }
    scanWork+=count;
    const split0=Math.min(ones0,count-ones0);
    const split1=Math.min(ones1,count-ones1);
    let symbol=split0>=split1?0:1;

    if(Math.max(split0,split1)===0){
      const firstBlock=activeBlocks[0];
      const block=firstBlock>>>countBits;
      const base=block*blockSize;
      const entry=entries[base];
      const localId=entry&localMask;
      const referenceId=base+localId;
      let referenceRangeIndex=0;
      while(referenceId>=ranges[referenceRangeIndex].end)referenceRangeIndex++;
      const reference=descriptor(
        referenceId,entry>>>localBits,ranges
      );
      let witness=null;
      const metrics={productPairs:0};
      let candidateRangeIndex=0;
      for(let blockPosition=0;blockPosition<activeBlockCount&&witness===null;blockPosition++){
        const packed=activeBlocks[blockPosition];
        const candidateBlock=packed>>>countBits;
        const length=packed&countMask;
        const candidateBase=candidateBlock*blockSize;
        for(let position=0;position<length;position++){
          const candidateEntry=entries[candidateBase+position];
          const candidateLocal=candidateEntry&localMask;
          const candidateId=candidateBase+candidateLocal;
          if(candidateId===referenceId)continue;
          while(candidateId>=ranges[candidateRangeIndex].end)candidateRangeIndex++;
          equivalenceChecks++;
          witness=firstDistinguishingSymbol(
            reference,
            descriptor(candidateId,candidateEntry>>>localBits,ranges),
            metrics
          );
          if(witness!==null)break;
        }
      }
      productPairs+=metrics.productPairs;
      if(witness===null){
        return {
          certified:true,queries,remaining:count,inputs,outputs,
          clone:decodeCandidate(reference),scanWork,equivalenceChecks,productPairs,
          resetMs,elapsedMs:Number((performance.now()-started).toFixed(3))
        };
      }
      symbol=witness;
    }

    if(query===maxQueries)break;
    const observed=await api.step(/** @type {0|1} */ (symbol));
    let kept=0,writeBlock=0,filterRangeIndex=0;
    for(let blockPosition=0;blockPosition<activeBlockCount;blockPosition++){
      const packed=activeBlocks[blockPosition];
      const block=packed>>>countBits;
      const length=packed&countMask;
      const base=block*blockSize;
      let write=0;
      for(let position=0;position<length;position++){
        const entry=entries[base+position];
        const localId=entry&localMask;
        const state=entry>>>localBits;
        const id=base+localId;
        while(id>=ranges[filterRangeIndex].end)filterRangeIndex++;
        const range=ranges[filterRangeIndex];
        const local=id-range.start;
        const outputMask=local&range.outputMask;
        const pair=state*2+symbol;
        if(((outputMask>>>pair)&1)===observed){
          const graphIndex=local>>>range.outputBits;
          const nextState=range.transitions[
            graphIndex*2*range.states+pair
          ];
          entries[base+write]=localId|(nextState<<localBits);
          write++;
          kept++;
        }
      }
      if(write>0)activeBlocks[writeBlock++]=(block<<countBits)|write;
    }
    activeBlockCount=writeBlock;
    scanWork+=count;
    if(kept===0)throw new Error('Oracle violates the declared five-state model bound');
    count=kept;
    queries++;
    inputs.push(symbol);
    outputs.push(observed);
  }

  return {
    certified:false,queries,remaining:count,inputs,outputs,clone:null,
    scanWork,equivalenceChecks,productPairs,resetMs,
    elapsedMs:Number((performance.now()-started).toFixed(3))
  };
}

/**
 * Generate deterministic held-out input words.
 * @param {number} seed
 * @param {number} count
 * @returns {number[][]}
 */
function heldoutWords(seed,count){
  let random=seed>>>0;
  const words=[];
  for(let index=0;index<count;index++){
    random=(Math.imul(random,1664525)+1013904223)>>>0;
    const length=1+((random>>>16)%60);
    const word=[];
    for(let offset=0;offset<length;offset++){
      random=(Math.imul(random,1664525)+1013904223)>>>0;
      word.push((random>>>16)&1);
    }
    words.push(word);
  }
  return words;
}

/**
 * Run a word from a machine's current state.
 * @param {Machine} model
 * @param {number[]} word
 * @returns {number[]}
 */
function traceFrom(model,word){
  let state=model.state;
  const outputs=[];
  for(const symbol of word){
    outputs.push(model.output[state][symbol]);
    state=model.next[state][symbol];
  }
  return outputs;
}

/**
 * Check equivalence from current states using independent partition refinement.
 * @param {Machine} left
 * @param {Machine} right
 * @returns {boolean}
 */
function equivalentFromStates(left,right){
  const offset=left.next.length;
  const next=[
    ...left.next.map(row=>row.slice()),
    ...right.next.map(row=>row.map(state=>state+offset))
  ];
  const output=[
    ...left.output.map(row=>row.slice()),
    ...right.output.map(row=>row.slice())
  ];
  const classes=observableStateClasses({next,output});
  return classes[left.state]===classes[offset+right.state];
}

/**
 * Run the three canonical five-state benchmark fixtures.
 * @param {number} [blockSize=32]
 * @returns {Promise<{
 *   representation:string,blockSize:number,models:number,candidateBytes:number,
 *   initializationMs:number,heldoutSequences:number,
 *   records:Array<{name:string,queries:number,remaining:number,scanWork:number,
 *     equivalenceChecks:number,productPairs:number,resetMs:number,learnerMs:number}>
 * }>}
 */
async function runFixtures(blockSize=32){
  const workspace=createWorkspace(blockSize);
  const fixtures=[
    {name:'random-five',model:makeIndependentMachine(0x42f5a7c9,5)},
    {name:'delayed-five',model:{
      next:[[1,0],[2,0],[3,0],[4,0],[4,0]],
      output:[[0,0],[0,0],[0,0],[1,0],[0,0]]
    }},
    {name:'padded-four',model:makeIndependentMachine(0x1f3a995b,4)}
  ];
  const records=[];
  for(let index=0;index<fixtures.length;index++){
    const fixture=fixtures[index];
    let privateState=0;
    const result=await learn({
      async step(symbol){
        const previous=privateState;
        privateState=fixture.model.next[previous][symbol];
        return /** @type {0|1} */ (fixture.model.output[previous][symbol]);
      }
    },workspace);
    const hidden={...fixture.model,state:privateState};
    assert.equal(result.certified,true,fixture.name);
    assert.equal(equivalentFromStates(result.clone,hidden),true,fixture.name);
    for(const word of heldoutWords((0x7123abc1+Math.imul(index,10309))>>>0,128)){
      assert.deepEqual(traceFrom(result.clone,word),traceFrom(hidden,word));
    }
    records.push({
      name:fixture.name,queries:result.queries,remaining:result.remaining,
      scanWork:result.scanWork,equivalenceChecks:result.equivalenceChecks,
      productPairs:result.productPairs,resetMs:result.resetMs,
      learnerMs:result.elapsedMs
    });
  }
  return {
    representation:'sparse block list + packed local-ID/state entries',
    blockSize,models:workspace.modelCount,candidateBytes:workspace.candidateBytes,
    initializationMs:workspace.initializationMs,
    heldoutSequences:fixtures.length*128,records
  };
}

module.exports={createWorkspace,learn,runFixtures};

if(require.main===module){
  const blockSize=Number(process.argv[2]||32);
  runFixtures(blockSize).then(result=>{
    process.stdout.write(JSON.stringify(result)+'\n');
  }).catch(error=>{
    process.stderr.write(String(error.stack||error)+'\n');
    process.exitCode=1;
  });
}
