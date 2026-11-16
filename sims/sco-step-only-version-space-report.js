'use strict';

const {enumerateMachines,distinguish,learnBoundedStepOnly}=
  require('./sco-step-only-version-space');
const {makeIndependentMachine}=require('./sco-sync-independent-distribution');

/** @typedef {{next:number[][],output:number[][]}} Machine */
/** @typedef {{cases:number,certified:number,falseCertificates:number,maxQueries:number,totalQueries:number,maxRemaining:number}} Summary */

/**
 * Evaluate a step-only public attacker on private finite-state fixtures.
 * A private model is passed solely to the evaluator. The attacker receives
 * only asynchronous binary outputs to chosen step inputs, then produces a
 * finite-model continuation certificate after exhausting its version space.
 *
 * @param {Machine} privateModel
 * @param {number} bound
 * @returns {Promise<{certified:boolean,queries:number,remaining:number,valid:boolean}>}
 */
async function evaluateContinuation(privateModel,bound){
  let current=0;
  let actualCalls=0;
  const api={
    /** @param {number} symbol @returns {Promise<number>} */
    async step(symbol){
      actualCalls++;
      const previous=current;
      current=privateModel.next[previous][symbol];
      return privateModel.output[previous][symbol];
    }
  };
  const result=await learnBoundedStepOnly(api,bound,64);
  if(result.queries!==actualCalls)throw new Error('Attacker query accounting mismatch');
  if(!result.certified)return {certified:false,queries:actualCalls,remaining:result.remaining,valid:false};
  if(!result.clone)throw new Error('Missing certified model');
  // Private source is used only here, after all public queries are finished.
  const hidden={next:privateModel.next,output:privateModel.output,state:current};
  const valid=distinguish(result.clone,hidden)===null;
  return {certified:true,queries:actualCalls,remaining:result.remaining,valid};
}

/**
 * Exhaust every labeled one/two-state machine and sample a separate SHA-256
 * three-state fixture family. The maximum state count is given to the attacker
 * as part of the research threat model. No source, state label or reset is
 * available through the attacker interface.
 *
 * @param {number} [threeStateSamples]
 * @param {boolean} [holdout]
 * @returns {Promise<{twoStates:Summary,threeStates:Summary,holdout:boolean}>}
 */
async function runVersionSpaceStudy(threeStateSamples=100,holdout=false){
  if(!Number.isSafeInteger(threeStateSamples)||threeStateSamples<1||threeStateSamples>250){
    throw new RangeError('threeStateSamples must be 1..250');
  }
  /** @returns {Summary} */
  function empty(){return {cases:0,certified:0,falseCertificates:0,maxQueries:0,totalQueries:0,maxRemaining:0};}
  const twoStates=empty();
  const threeStates=empty();
  /** @param {Summary} total @param {Awaited<ReturnType<typeof evaluateContinuation>>} item */
  function update(total,item){
    total.cases++;
    if(item.certified)total.certified++;
    if(item.certified&&!item.valid)total.falseCertificates++;
    total.maxQueries=Math.max(total.maxQueries,item.queries);
    total.totalQueries+=item.queries;
    total.maxRemaining=Math.max(total.maxRemaining,item.remaining);
  }
  for(const model of enumerateMachines(2)){
    update(twoStates,await evaluateContinuation(model,2));
  }
  const base=holdout?0x51a9c603:0xa82b11f5;
  const stride=holdout?8467:4973;
  for(let index=0;index<threeStateSamples;index++){
    const model=makeIndependentMachine((base+Math.imul(index,stride))>>>0,3);
    update(threeStates,await evaluateContinuation(model,3));
  }
  return {twoStates,threeStates,holdout};
}

if(require.main===module){
  runVersionSpaceStudy(process.argv.includes('--quick')?12:100,process.argv.includes('--holdout'))
    .then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={evaluateContinuation,runVersionSpaceStudy};
