'use strict';

const {parentPort,workerData}=require('node:worker_threads');
const {cloneTopDerivativeProjectedAffine}=require('./rankfive-top-derivative-projected-affine-hybrid-peer');

/** @typedef {{kind:'projected-affine',bits:number,rank:5,table:number[],coordinates:number[],affineCorrections:number[]}|{kind:'anf',bits:number,lower:Array<[number,number]>,top:Array<[number,number]>,degree:4|5}} HybridModel */
/** @typedef {{fastPathSuccess:boolean,witnessTrials:number,witnessDrawCount:number,witnessProbability:number,witnessFailureBound:number,quotientRank:number|null,fastQueries:number,verificationQueries:number,verificationSamples:number,verificationCap:number,verificationDelta:number,falseAcceptanceBound:number,verificationPassed:boolean,fallbackUsed:boolean,fallbackReason:string|null,fallbackQueries:number,exactByInterpolation:boolean}} Diagnostics */

const port=/** @type {import('node:worker_threads').MessagePort} */ (parentPort);
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
  const result=cloneTopDerivativeProjectedAffine(
    oracle,32,drawWitness,drawVerify,1e-10
  );
  if(result.queries!==queryCount)throw new Error('Learner cache count differs from worker oracle calls');
  /** @type {Diagnostics} */
  const diagnostics=result.diagnostics;
  port.postMessage({
    type:'result',
    model:result.model,
    queryCount,
    diagnostics:{
      ...diagnostics,
      witnessDrawCount:witnessIndex,
      verifyDrawCount:verifyIndex
    }
  });
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
