'use strict';

const {createPolicy,learnExpected,sameFutureBehavior}=
  require('./sco-two-state-optimal-network-policy');

/** @typedef {import('./sco-two-state-optimal-network-policy').Machine} Machine */
/** @typedef {{equivalent:number,falseCertificate:number,contradiction:number}} Bucket */
/** @typedef {{id:number,calls:number,inputs:number[],outputs:number[]}} Witness */

/**
 * Enumerate the complete 6^6=46,656 labelled deterministic three-state
 * binary-input/binary-output Mealy source tables in the same mixed-radix
 * convention as the learner's 1/2-state table enumeration. State 0 starts
 * every experiment; unreachable states remain represented in the prior.
 *
 * @param {number} code
 * @returns {Machine}
 */
function decodeThreeState(code){
  if(!Number.isSafeInteger(code)||code<0||code>=46656){
    throw new RangeError('Expected three-state table ID from 0 to 46655');
  }
  const next=Array.from({length:3},()=>[0,0]);
  const output=Array.from({length:3},()=>[0,0]);
  for(let state=0;state<3;state++)for(let input=0;input<2;input++){
    const digit=code%6;code=Math.floor(code/6);
    next[state][input]=Math.floor(digit/2);
    output[state][input]=digit%2;
  }
  return {next,output};
}

/** @param {Machine} model @returns {number} */
function reachableStates(model){
  const seen=new Set([0]),queue=[0];
  for(let at=0;at<queue.length;at++)for(let input=0;input<2;input++){
    const next=model.next[queue[at]][input];
    if(!seen.has(next)){seen.add(next);queue.push(next);}
  }
  return seen.size;
}

/**
 * Fully reachable is not the same as minimal: equivalent rooted states may
 * remain after observing both transitions. This predicate checks that all
 * three states have pairwise distinct future output behavior.
 * @param {Machine} model
 * @returns {boolean}
 */
function minimalThree(model){
  return reachableStates(model)===3&&
    !sameFutureBehavior(model,0,model,1)&&
    !sameFutureBehavior(model,0,model,2)&&
    !sameFutureBehavior(model,1,model,2);
}

/**
 * Complete model-class misspecification test. Unlike the in-class 260-model
 * minimax result, this is a FALSIFICATION census over 46,656 three-state
 * source tables; its fractions do not estimate a real-world attack success
 * probability. Each source receives one unreset oracle session from state 0.
 *
 * The distinction matters: an out-of-class oracle can contradict the
 * assumed two-state model, be behaviorally cloned incidentally after state
 * advancement, or produce a false terminal certificate.
 *
 * @returns {Promise<{
 *   population:number,certifiedEquivalent:number,falseCertificates:number,
 *   contradictions:number,
 *   groups:{reachableOne:Bucket,reachableTwo:Bucket,reachableThreeReducible:Bucket,
 *     reachableThreeMinimal:Bucket},
 *   falseByCalls:Record<number,number>,trueByCalls:Record<number,number>,
 *   contradictionByCalls:Record<number,number>,
 *   firstFalse:Witness|null,firstContradiction:{id:number,calls:number}|null
 * }>}
 */
async function censusThreeState(){
  const policy=createPolicy();
  const zero=()=>({equivalent:0,falseCertificate:0,contradiction:0});
  const groups={
    reachableOne:zero(),reachableTwo:zero(),
    reachableThreeReducible:zero(),reachableThreeMinimal:zero()
  };
  /** @type {Record<number,number>} */
  const falseByCalls={};
  /** @type {Record<number,number>} */
  const trueByCalls={};
  /** @type {Record<number,number>} */
  const contradictionByCalls={};
  /** @type {Witness|null} */
  let firstFalse=null;
  /** @type {{id:number,calls:number}|null} */
  let firstContradiction=null;
  let certifiedEquivalent=0,falseCertificates=0,contradictions=0;
  for(let id=0;id<46656;id++){
    const model=decodeThreeState(id);
    const reachable=reachableStates(model);
    /** @type {keyof typeof groups} */
    const key=reachable===1?'reachableOne':
      reachable===2?'reachableTwo':
        minimalThree(model)?'reachableThreeMinimal':'reachableThreeReducible';
    const bucket=groups[key];
    let currentState=0,calls=0;
    try{
      const learned=await learnExpected({step:async input=>{
        const output=model.output[currentState][input];
        currentState=model.next[currentState][input];
        calls++;
        return output;
      }},policy);
      if(sameFutureBehavior(learned.clone,learned.currentState,model,currentState)){
        certifiedEquivalent++;
        bucket.equivalent++;
        trueByCalls[calls]=(trueByCalls[calls]??0)+1;
      }else{
        falseCertificates++;
        bucket.falseCertificate++;
        falseByCalls[calls]=(falseByCalls[calls]??0)+1;
        if(firstFalse===null)firstFalse={
          id,calls,inputs:learned.inputs,outputs:learned.outputs
        };
      }
    }catch(error){
      if(!(error instanceof Error)||
          error.message!=='Oracle violated trusted two-state hypothesis'){
        throw error;
      }
      contradictions++;
      bucket.contradiction++;
      contradictionByCalls[calls]=(contradictionByCalls[calls]??0)+1;
      if(firstContradiction===null)firstContradiction={id,calls};
    }
  }
  return {population:46656,certifiedEquivalent,falseCertificates,contradictions,
    groups,falseByCalls,trueByCalls,contradictionByCalls,firstFalse,firstContradiction};
}

if(require.main===module){
  censusThreeState().then(value=>console.log(JSON.stringify(value,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={decodeThreeState,reachableStates,minimalThree,censusThreeState};
