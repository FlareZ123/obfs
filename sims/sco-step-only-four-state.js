'use strict';

const {performance}=require('node:perf_hooks');

const FOUR_STATE_MODEL_COUNT=1<<24;
const FOUR_STATE_CODE_MASK=0x00ffffff;

/** @typedef {{next:number[][],output:number[][],state:number}} Candidate */
/** @typedef {{step:(symbol:number)=>Promise<number>}} StepOnlyOracle */
/** @typedef {{certified:boolean,queries:number,remaining:number,inputs:number[],outputs:number[],clone:Candidate|null,
 *  modelBound:4,modelCount:number,scanWork:number,equivalenceChecks:number,productPairs:number,elapsedMs:number}} FourStateLearningResult */

/**
 * Decode one packed four-state binary Mealy machine. The low 16 bits encode
 * two-bit successor states for each state/input pair; the high 8 bits encode
 * one-bit outputs. The supplied current state is tracked separately.
 * @param {number} code
 * @param {number} [state]
 * @returns {Candidate}
 */
function decodeFourStateCode(code,state=0){
  if(!Number.isSafeInteger(code)||code<0||code>=FOUR_STATE_MODEL_COUNT ||
      !Number.isSafeInteger(state)||state<0||state>3){
    throw new RangeError('Invalid packed four-state model');
  }
  /** @type {number[][]} */
  const next=Array.from({length:4},()=>[0,0]);
  /** @type {number[][]} */
  const output=Array.from({length:4},()=>[0,0]);
  for(let source=0;source<4;source++)for(let symbol=0;symbol<2;symbol++){
    const pair=source*2+symbol;
    next[source][symbol]=(code >>> (pair*2))&3;
    output[source][symbol]=(code >>> (16+pair))&1;
  }
  return {next,output,state};
}

/**
 * Return the first input symbol of a shortest distinguishing word between
 * two packed machines from their current states. BFS visits at most 16 state
 * pairs. A null result means the two continuations are exactly equivalent.
 *
 * @param {number} leftCode
 * @param {number} leftState
 * @param {number} rightCode
 * @param {number} rightState
 * @param {{productPairs?:number}} [metrics]
 * @returns {number|null}
 */
function firstDistinguishingSymbol(leftCode,leftState,rightCode,rightState,metrics){
  const start=(leftState<<2)|rightState;
  const queue=new Uint8Array(16);
  const first=new Int8Array(16);
  first.fill(-1);
  let head=0,tail=0,seen=1<<start;
  queue[tail++]=start;
  while(head<tail){
    const pair=queue[head++];
    if(metrics)metrics.productPairs=(metrics.productPairs||0)+1;
    const left=pair>>>2,right=pair&3;
    for(let symbol=0;symbol<2;symbol++){
      const leftPair=left*2+symbol,rightPair=right*2+symbol;
      const leftOutput=(leftCode >>> (16+leftPair))&1;
      const rightOutput=(rightCode >>> (16+rightPair))&1;
      if(leftOutput!==rightOutput){
        return first[pair]===-1?symbol:first[pair];
      }
      const leftNext=(leftCode >>> (leftPair*2))&3;
      const rightNext=(rightCode >>> (rightPair*2))&3;
      const nextPair=(leftNext<<2)|rightNext;
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
 * Exact no-reset continuation learner for every deterministic binary Mealy
 * machine with at most four states. All 2^24 labeled four-state models are
 * represented by one 64 MiB packed code array. Smaller machines are included
 * by padding unreachable states. The live private model is never passed to
 * this function: only the public step callback is observed.
 *
 * If certified is true, every packed model consistent with the observed
 * transcript has the same future output behavior from its current state.
 * This is a rigorous conditional continuation certificate, assuming the
 * real service is deterministic, binary-input/binary-output, started in its
 * modeled initial state, and has at most four states. An understated bound
 * can produce a false certificate; see the explicit five-state negative
 * control in the tests. The method does not recover private source or keys.
 *
 * @param {StepOnlyOracle} api
 * @param {number} [maxQueries]
 * @returns {Promise<FourStateLearningResult>}
 */
async function learnFourStateStepOnly(api,maxQueries=64){
  if(!Number.isSafeInteger(maxQueries)||maxQueries<1||maxQueries>512){
    throw new RangeError('maxQueries must be 1..512');
  }
  const started=performance.now();
  // Pack the model code in the low 24 bits and current state in the high 2.
  // The active hypotheses remain a compact in-place prefix after filtering.
  const packedModels=new Uint32Array(FOUR_STATE_MODEL_COUNT);
  for(let code=0;code<FOUR_STATE_MODEL_COUNT;code++)packedModels[code]=code;
  let count=FOUR_STATE_MODEL_COUNT;
  let queries=0,scanWork=0,equivalenceChecks=0,productPairs=0;
  /** @type {number[]} */
  const inputs=[];
  /** @type {number[]} */
  const outputs=[];
  for(let query=0;query<=maxQueries;query++){
    let ones0=0,ones1=0;
    for(let index=0;index<count;index++){
      const packed=packedModels[index];
      const code=packed&FOUR_STATE_CODE_MASK;
      const state=packed>>>24;
      ones0+=(code >>> (16+state*2))&1;
      ones1+=(code >>> (17+state*2))&1;
    }
    scanWork+=count;
    const split0=Math.min(ones0,count-ones0);
    const split1=Math.min(ones1,count-ones1);
    let symbol=split0>=split1?0:1;
    if(Math.max(split0,split1)===0){
      const reference=packedModels[0];
      const referenceCode=reference&FOUR_STATE_CODE_MASK;
      const referenceState=reference>>>24;
      /** @type {number|null} */
      let witness=null;
      const metrics={productPairs:0};
      for(let index=1;index<count;index++){
        const packed=packedModels[index];
        equivalenceChecks++;
        witness=firstDistinguishingSymbol(referenceCode,referenceState,
          packed&FOUR_STATE_CODE_MASK,packed>>>24,metrics);
        if(witness!==null)break;
      }
      productPairs+=metrics.productPairs||0;
      if(witness===null){
        return {
          certified:true,queries,remaining:count,inputs,outputs,
          clone:decodeFourStateCode(referenceCode,referenceState),
          modelBound:4,modelCount:FOUR_STATE_MODEL_COUNT,scanWork,
          equivalenceChecks,productPairs,
          elapsedMs:Number((performance.now()-started).toFixed(3))
        };
      }
      symbol=witness;
    }
    if(query===maxQueries)break;
    const observed=await api.step(symbol);
    if(observed!==0&&observed!==1){
      throw new RangeError('Expected binary output');
    }
    let write=0;
    for(let index=0;index<count;index++){
      const packed=packedModels[index];
      const code=packed&FOUR_STATE_CODE_MASK;
      const state=packed>>>24;
      const pair=state*2+symbol;
      if(((code >>> (16+pair))&1)===observed){
        const next=(code >>> (pair*2))&3;
        packedModels[write++]=code|(next<<24);
      }
    }
    scanWork+=count;
    if(write===0){
      throw new Error('Observed oracle violates declared four-state bound');
    }
    count=write;
    queries++;
    inputs.push(symbol);
    outputs.push(observed);
  }
  return {
    certified:false,queries,remaining:count,inputs,outputs,clone:null,
    modelBound:4,modelCount:FOUR_STATE_MODEL_COUNT,scanWork,
    equivalenceChecks,productPairs,
    elapsedMs:Number((performance.now()-started).toFixed(3))
  };
}

module.exports={FOUR_STATE_MODEL_COUNT,decodeFourStateCode,
  firstDistinguishingSymbol,learnFourStateStepOnly};
