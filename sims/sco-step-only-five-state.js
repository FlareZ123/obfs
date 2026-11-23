'use strict';

const {performance}=require('node:perf_hooks');
const ID_MASK=0x0fffffff;
const STATE_SHIFT=28;
const FIVE_STATE_MODEL_COUNT=165888708;

/** @typedef {{next:number[][],output:number[][],state:number}} Candidate */
/** @typedef {{step:(symbol:number)=>Promise<number>}} StepOnlyOracle */
/** @typedef {{states:number,start:number,end:number,outputBits:number,outputMask:number,transitions:Uint8Array,graphCount:number}} Range */
/** @typedef {{ids:Uint32Array,ranges:Range[],modelCount:number,initializationMs:number,reset:()=>void}} FiveStateWorkspace */
/** @typedef {{certified:boolean,queries:number,remaining:number,inputs:number[],outputs:number[],clone:Candidate|null,modelBound:5,modelCount:number,scanWork:number,equivalenceChecks:number,productPairs:number,elapsedMs:number,workspaceInitializationMs:number,candidateBytes:number}} FiveStateLearningResult */

/** @param {number} states @returns {number} */
function canonicalTransitionCount(states){
  if(!Number.isSafeInteger(states)||states<1||states>5){
    throw new RangeError('states must be 1..5');
  }
  let counts=new Float64Array(states+1);
  counts[1]=1;
  for(let source=0;source<states;source++){
    const next=new Float64Array(states+1);
    for(let discovered=source+1;discovered<=states;discovered++){
      const ways=counts[discovered];
      next[discovered]+=ways*discovered*discovered;
      if(discovered+1<=states)next[discovered+1]+=ways*(2*discovered+1);
      if(discovered+2<=states)next[discovered+2]+=ways;
    }
    counts=next;
  }
  return counts[states];
}

/** @param {number} states @returns {{count:number,transitions:Uint8Array}} */
function generateCanonicalTransitions(states){
  if(!Number.isSafeInteger(states)||states<1||states>5){
    throw new RangeError('states must be 1..5');
  }
  const count=canonicalTransitionCount(states);
  const transitions=new Uint8Array(count*2*states);
  const next=new Uint8Array(2*states);
  let cursor=0;
  /** @param {number} source @param {number} discovered */
  function visit(source,discovered){
    if(source===states){
      if(discovered===states){
        transitions.set(next,cursor*2*states);
        cursor++;
      }
      return;
    }
    if(discovered<source+1)return;
    const pair=source*2;
    for(let first=0;first<=discovered;first++){
      const afterFirst=discovered+(first===discovered?1:0);
      if(afterFirst>states)continue;
      next[pair]=first;
      for(let second=0;second<=afterFirst;second++){
        const afterSecond=afterFirst+(second===afterFirst?1:0);
        if(afterSecond>states)continue;
        next[pair+1]=second;
        visit(source+1,afterSecond);
      }
    }
  }
  visit(0,1);
  if(cursor!==count)throw new Error('Canonical transition count mismatch');
  return {count,transitions};
}

/** @returns {FiveStateWorkspace} */
function createFiveStateWorkspace(){
  const started=performance.now();
  /** @type {Range[]} */
  const ranges=[];
  let offset=0;
  for(let states=1;states<=5;states++){
    const generated=generateCanonicalTransitions(states);
    const outputBits=2*states;
    const outputCount=1<<outputBits;
    const count=generated.count*outputCount;
    ranges.push({
      states,start:offset,end:offset+count,outputBits,
      outputMask:outputCount-1,transitions:generated.transitions,
      graphCount:generated.count
    });
    offset+=count;
  }
  if(offset!==FIVE_STATE_MODEL_COUNT){
    throw new Error('Unexpected five-state model-space size');
  }
  const ids=new Uint32Array(offset);
  const reset=()=>{for(let index=0;index<offset;index++)ids[index]=index;};
  reset();
  return {
    ids,ranges,modelCount:offset,
    initializationMs:Number((performance.now()-started).toFixed(3)),
    reset
  };
}

/** @param {number} packed @param {Range[]} ranges */
function decodeDescriptor(packed,ranges){
  const id=packed&ID_MASK;
  for(const range of ranges){
    if(id<range.end){
      const local=id-range.start;
      const graphIndex=local>>>range.outputBits;
      return {
        range,graphIndex,graphOffset:graphIndex*2*range.states,
        outputMask:local&range.outputMask,state:packed>>>STATE_SHIFT
      };
    }
  }
  throw new RangeError('Unknown canonical model ID');
}

/**
 * Product BFS over at most 5x5 state pairs.
 * @param {ReturnType<typeof decodeDescriptor>} left
 * @param {ReturnType<typeof decodeDescriptor>} right
 * @param {{productPairs:number}} metrics
 * @returns {number|null}
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
      const leftOutput=(left.outputMask>>>leftPair)&1;
      const rightOutput=(right.outputMask>>>rightPair)&1;
      if(leftOutput!==rightOutput){
        return first[pair]===-1?symbol:first[pair];
      }
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

/** @param {ReturnType<typeof decodeDescriptor>} descriptor @returns {Candidate} */
function decodeCandidate(descriptor){
  const {range,graphOffset,outputMask,state}=descriptor;
  const next=Array.from({length:range.states},()=>[0,0]);
  const output=Array.from({length:range.states},()=>[0,0]);
  for(let source=0;source<range.states;source++)for(let symbol=0;symbol<2;symbol++){
    const pair=source*2+symbol;
    next[source][symbol]=range.transitions[graphOffset+pair];
    output[source][symbol]=(outputMask>>>pair)&1;
  }
  return {next,output,state};
}

/**
 * Exact no-reset learner for all rooted deterministic binary Mealy machines
 * with at most five states, canonicalized by BFS state discovery. The workspace
 * is mutable and must not be shared by concurrent calls. Canonical labeling
 * removes unreachable states and state-renaming duplicates; every smaller
 * reachable machine is included as its own state-count segment.
 *
 * @param {StepOnlyOracle} api
 * @param {number} [maxQueries]
 * @param {FiveStateWorkspace} [workspace]
 * @returns {Promise<FiveStateLearningResult>}
 */
async function learnFiveStateStepOnly(api,maxQueries=128,workspace){
  if(!Number.isSafeInteger(maxQueries)||maxQueries<1||maxQueries>512){
    throw new RangeError('maxQueries must be 1..512');
  }
  const activeWorkspace=workspace||createFiveStateWorkspace();
  if(activeWorkspace.modelCount!==FIVE_STATE_MODEL_COUNT){
    throw new RangeError('Invalid five-state workspace');
  }
  const started=performance.now();
  activeWorkspace.reset();
  const ids=activeWorkspace.ids;
  const ranges=activeWorkspace.ranges;
  let count=activeWorkspace.modelCount;
  let queries=0,scanWork=0,equivalenceChecks=0,productPairs=0;
  /** @type {number[]} */
  const inputs=[];
  /** @type {number[]} */
  const outputs=[];
  for(let query=0;query<=maxQueries;query++){
    let ones0=0,ones1=0,cursor=0;
    for(const range of ranges){
      while(cursor<count){
        const packed=ids[cursor];
        const id=packed&ID_MASK;
        if(id>=range.end)break;
        const state=packed>>>STATE_SHIFT;
        const local=id-range.start;
        const outputMask=local&range.outputMask;
        ones0+=(outputMask>>>(state*2))&1;
        ones1+=(outputMask>>>(state*2+1))&1;
        cursor++;
      }
    }
    scanWork+=count;
    const split0=Math.min(ones0,count-ones0);
    const split1=Math.min(ones1,count-ones1);
    let symbol=split0>=split1?0:1;
    if(Math.max(split0,split1)===0){
      const reference=decodeDescriptor(ids[0],ranges);
      /** @type {number|null} */
      let witness=null;
      const metrics={productPairs:0};
      for(let index=1;index<count;index++){
        equivalenceChecks++;
        witness=firstDistinguishingSymbol(reference,decodeDescriptor(ids[index],ranges),metrics);
        if(witness!==null)break;
      }
      productPairs+=metrics.productPairs;
      if(witness===null){
        return {
          certified:true,queries,remaining:count,inputs,outputs,
          clone:decodeCandidate(reference),modelBound:5,
          modelCount:activeWorkspace.modelCount,scanWork,
          equivalenceChecks,productPairs,
          elapsedMs:Number((performance.now()-started).toFixed(3)),
          workspaceInitializationMs:activeWorkspace.initializationMs,
          candidateBytes:ids.byteLength
        };
      }
      symbol=witness;
    }
    if(query===maxQueries)break;
    const observed=await api.step(symbol);
    if(observed!==0&&observed!==1)throw new RangeError('Expected binary output');
    let write=0;
    cursor=0;
    for(const range of ranges){
      while(cursor<count){
        const packed=ids[cursor];
        const id=packed&ID_MASK;
        if(id>=range.end)break;
        const state=packed>>>STATE_SHIFT;
        const local=id-range.start;
        const outputMask=local&range.outputMask;
        const pair=state*2+symbol;
        if(((outputMask>>>pair)&1)===observed){
          const graphIndex=local>>>range.outputBits;
          const nextState=range.transitions[graphIndex*2*range.states+pair];
          ids[write++]=id|(nextState<<STATE_SHIFT);
        }
        cursor++;
      }
    }
    scanWork+=count;
    if(write===0)throw new Error('Observed oracle violates declared five-state bound');
    count=write;
    queries++;
    inputs.push(symbol);
    outputs.push(observed);
  }
  return {
    certified:false,queries,remaining:count,inputs,outputs,clone:null,
    modelBound:5,modelCount:activeWorkspace.modelCount,scanWork,
    equivalenceChecks,productPairs,
    elapsedMs:Number((performance.now()-started).toFixed(3)),
    workspaceInitializationMs:activeWorkspace.initializationMs,
    candidateBytes:ids.byteLength
  };
}

module.exports={
  FIVE_STATE_MODEL_COUNT,canonicalTransitionCount,generateCanonicalTransitions,
  createFiveStateWorkspace,firstDistinguishingSymbol,learnFiveStateStepOnly
};
