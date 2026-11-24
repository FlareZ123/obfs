'use strict';

const {parentPort,workerData}=require('node:worker_threads');
const {cloneTopQuinticValidated}=require('./rankfive-top-quintic-validated-peer');

/** @typedef {{bits:number,lower:Array<[number,number]>,top:Array<[number,number]>,degree:4|5,queries:number,trials:number,quotientRank:number,trialCap:number}} QuinticModel */
/** @typedef {QuinticModel & {fastQueries:number,verificationQueries:number,verificationSamples:number,verificationCap:number,verificationDelta:number,falseAcceptanceBound:number,verificationPassed:boolean,fallbackUsed:boolean,fallbackReason:string|null,exactByInterpolation:boolean}} ValidatedModel */
/** @typedef {{degree:number,quotientRank:number,fastQueries:number,verificationQueries:number,verificationSamples:number,verificationCap:number,verificationDelta:number,falseAcceptanceBound:number,verificationPassed:boolean,fallbackUsed:boolean,fallbackReason:string|null,exactByInterpolation:boolean,witnessDrawCount:number,verifyDrawCount:number}} LearnerDiagnostics */

const port=parentPort;
if(!port)throw new Error('Worker requires a parent port');
const shared=new Int32Array(workerData.sharedBuffer);
let queryCount=0;
let witnessIndex=0;
let verifyIndex=0;

/** @param {number} input @returns {number} */
function oracle(input){
  const sequence=queryCount++;
  Atomics.store(shared,0,0);
  port.postMessage({type:'query',input:input>>>0,sequence});
  const waitResult=Atomics.wait(shared,0,0,30000);
  if(waitResult==='timed-out')throw new Error('HTTP oracle response timed out');
  const status=Atomics.load(shared,0);
  if(status!==1)throw new Error('HTTP oracle response failed with status '+status);
  return Atomics.load(shared,1)>>>0;
}

/** @returns {number} */
function drawWitness(){
  if(witnessIndex>=workerData.witnessDraws.length)throw new Error('Witness random tape exhausted');
  return workerData.witnessDraws[witnessIndex++]>>>0;
}

/** @returns {number} */
function drawVerify(){
  if(verifyIndex>=workerData.verifyDraws.length)throw new Error('Postfit random tape exhausted');
  return workerData.verifyDraws[verifyIndex++]>>>0;
}

try{
  const model=/** @type {ValidatedModel} */ (cloneTopQuinticValidated(
    oracle,32,drawWitness,drawVerify,1e-10
  ));
  assertModelQueryCount(model);
  /** @type {LearnerDiagnostics} */
  const diagnostics={
    degree:model.degree,
    quotientRank:model.quotientRank??0,
    fastQueries:model.fastQueries,
    verificationQueries:model.verificationQueries,
    verificationSamples:model.verificationSamples,
    verificationCap:model.verificationCap,
    verificationDelta:model.verificationDelta,
    falseAcceptanceBound:model.falseAcceptanceBound,
    verificationPassed:model.verificationPassed,
    fallbackUsed:model.fallbackUsed,
    fallbackReason:model.fallbackReason??null,
    exactByInterpolation:model.exactByInterpolation,
    witnessDrawCount:witnessIndex,
    verifyDrawCount:verifyIndex
  };
  port.postMessage({type:'result',model,queryCount,diagnostics});
}catch(error){
  port.postMessage({
    type:'error',
    message:error instanceof Error?error.message:String(error),
    stack:error instanceof Error?error.stack:undefined,
    queryCount,
    witnessDrawCount:witnessIndex,
    verifyDrawCount:verifyIndex
  });
}

/** @param {ValidatedModel} model */
function assertModelQueryCount(model){
  if(model.queries!==queryCount)throw new Error('Learner cache count differs from worker oracle calls');
}
