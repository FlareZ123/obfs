'use strict';

const assert=require('node:assert/strict');
const {createHash,randomBytes}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const {privateSource,executeArm}=require('./sco-rankfive-arbitrary-table-real-http');
const {cloneTopQuinticValidated}=require('./rankfive-top-quintic-validated-peer');
const {evaluateClone}=require('./rankfive-top-quintic-functional-clone-peer');

/** @typedef {{origin:string,method:string,credential:string}} Access */
/** @typedef {{bits:number,lower:Array<[number,number]>,top:Array<[number,number]>,degree:4|5,queries:number,trials:number,quotientRank:number,trialCap:number}} QuinticModel */
/** @typedef {(model:unknown,input:number)=>number} ModelEvaluator */
/** @typedef {QuinticModel & {degree:number,queries:number,quotientRank:number,fastQueries:number,verificationQueries:number,verificationSamples:number,verificationCap:number,verificationDelta:number,falseAcceptanceBound:number,verificationPassed:boolean,fallbackUsed:boolean,fallbackReason:string|null,exactByInterpolation:boolean}} ValidatedModel */
/** @typedef {{degree:number,quotientRank:number,fastQueries:number,verificationQueries:number,verificationSamples:number,verificationCap:number,verificationDelta:number,falseAcceptanceBound:number,verificationPassed:boolean,fallbackUsed:boolean,fallbackReason:string|null,exactByInterpolation:boolean,witnessDrawCount:number,verifyDrawCount:number}} LearnerDiagnostics */

const MASKS=[0xc7639c15,0x32e67ad1,0xe5ab17c2,0x4692ed7f,0x1fa37cc9];

/** @param {number[]} words @returns {number} */
function gf2Rank32(words){
  const pivots=Array(32).fill(0);
  let rank=0;
  for(let word of words){
    word>>>=0;
    for(let bit=31;bit>=0;bit--){
      if(((word>>>bit)&1)===0)continue;
      if(pivots[bit]!==0)word=(word^pivots[bit])>>>0;
      else{pivots[bit]=word;rank++;break;}
    }
  }
  return rank;
}

/** @returns {number[]} */
function privateTable(){
  const table=Array.from({length:32},(_,index)=>
    createHash('sha256').update('private-table-rank5/'+index).digest().readUInt32BE(0));
  table[31]=(table[31]^0x9765c3af)>>>0;
  return table;
}

/** @param {string} source @returns {{maskRank:number,tableTopCoefficient:number,sourceHash:string}} */
function verifySourcePromise(source){
  const maskRank=gf2Rank32(MASKS);
  const tableTopCoefficient=privateTable().reduce((value,word)=>(value^word)>>>0,0);
  assert.equal(maskRank,5,'the five parity projections must be independent');
  assert.notEqual(tableTopCoefficient,0,'the arbitrary table must have a nonzero fifth-degree coefficient');
  for(let index=0;index<MASKS.length;index++){
    const literal='const OBFS_PRIVATE_MASK'+index+'=0x'+MASKS[index].toString(16)+';';
    assert.ok(source.includes(literal),'the source mask differs from the preregistered mask');
  }
  return {
    maskRank,
    tableTopCoefficient,
    sourceHash:createHash('sha256').update(source).digest('hex')
  };
}

/**
 * Run the synchronous learner in a worker so the main thread can service each
 * oracle query asynchronously without restarting and replaying the full model.
 *
 * @param {Access} access
 * @param {number[]} witnessDraws
 * @param {number[]} verifyDraws
 * @returns {Promise<{model:unknown,queries:number,transcriptSha256:string,diagnostics:LearnerDiagnostics}>}
 */
async function cloneTopQuinticFromHttp(access,witnessDraws,verifyDraws){
  const sharedBuffer=new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT*2);
  const shared=new Int32Array(sharedBuffer);
  const worker=new Worker(path.join(__dirname,'rankfive-top-quintic-http-worker.cjs'),{
    workerData:{sharedBuffer,witnessDraws,verifyDraws}
  });
  /** @type {Map<number,number>} */
  const seen=new Map();
  const transcript=createHash('sha256');
  return await new Promise((resolve,reject)=>{
    let settled=false;
    /** @type {unknown} */
    let failure=null;
    worker.on('message',async message=>{
      if(message.type==='query'){
        try{
          const input=message.input>>>0;
          assert.equal(message.sequence,seen.size,'worker query sequence is not monotonic');
          assert.ok(!seen.has(input),'worker requested a duplicate input despite its local cache');
          const response=await fetch(access.origin+'/obfs/rpc',{
            method:'POST',
            headers:{
              'content-type':'application/json',
              'x-demo-session':access.credential
            },
            body:JSON.stringify({method:access.method,args:[input]})
          });
          assert.equal(response.status,200,'Legitimate forward query rejected');
          /** @type {{ok?:boolean,value?:unknown}} */
          const data=await response.json();
          assert.equal(data.ok,true);
          assert.ok(typeof data.value==='number'&&Number.isInteger(data.value)&&
            data.value>=0&&data.value<2**32,'Private RPC output is not a uint32');
          const value=/** @type {number} */ (data.value);
          seen.set(input,value);
          transcript.update(JSON.stringify([input,value])+'\n');
          Atomics.store(shared,1,value|0);
          Atomics.store(shared,0,1);
          Atomics.notify(shared,0);
        }catch(error){
          failure=error;
          Atomics.store(shared,0,2);
          Atomics.notify(shared,0);
        }
      }else if(message.type==='result'){
        if(settled)return;
        settled=true;
        try{
          assert.equal(message.queryCount,seen.size);
          assert.equal(message.model.queries,seen.size);
          resolve({
            model:message.model,
            queries:seen.size,
            transcriptSha256:transcript.digest('hex'),
            diagnostics:message.diagnostics
          });
        }catch(error){
          reject(error);
        }finally{
          worker.terminate().catch(()=>{});
        }
      }else if(message.type==='error'){
        if(settled)return;
        settled=true;
        worker.terminate().catch(()=>{});
        reject(failure??new Error(message.message));
      }
    });
    worker.on('error',error=>{
      if(settled)return;
      settled=true;
      reject(error);
    });
    worker.on('exit',code=>{
      if(settled)return;
      settled=true;
      reject(failure??new Error('Top-quintic worker exited before returning a result (code '+code+')'));
    });
  });
}

/** @returns {Promise<object>} */
async function compare(){
  const source=privateSource();
  const sourcePromise=verifySourcePromise(source);
  /** @type {number[]} */
  const witnessDraws=Array.from({length:162},secureWord);
  /** @type {number[]} */
  const verifyDraws=Array.from({length:726},secureWord);
  /** @type {(access:Access,_unusedDraws:number[])=>Promise<{model:unknown,queries:number,transcriptSha256:string,diagnostics:LearnerDiagnostics}>} */
  const cloneRunner=(access,_unusedDraws)=>
    cloneTopQuinticFromHttp(access,witnessDraws,verifyDraws);
  /** @type {ModelEvaluator} */
  const modelEvaluator=(model,input)=>
    evaluateClone(/** @type {QuinticModel} */ (model),input);
  const options={
    cloneRunner,
    modelEvaluator,
    maxQueries:246212
  };
  const sco=await executeArm('sco',source,[],options);
  const native=await executeArm('native',source,[],options);
  assert.equal(sco.sourceHash,native.sourceHash);
  assert.equal(sco.sourceHash,sourcePromise.sourceHash);
  assert.equal(sco.queries,native.queries);
  assert.equal(sco.transcriptSha256,native.transcriptSha256);
  assert.equal(sco.heldouts,1024);
  assert.equal(native.heldouts,1024);
  assert.equal(sco.deniedStatus,403);
  assert.equal(native.deniedStatus,403);
  assert.equal(sco.publishedPrivateNames,false);
  assert.equal(native.publishedPrivateNames,false);
  assert.equal(sco.offlineAfterServerClosed,true);
  assert.equal(native.offlineAfterServerClosed,true);
  assert.equal(sco.privateExecutions,sco.queries);
  assert.equal(native.privateExecutions,native.queries);
  assert.ok(sco.learnerDiagnostics);
  assert.ok(native.learnerDiagnostics);
  assert.deepEqual(sco.learnerDiagnostics,native.learnerDiagnostics);
  const diagnostics=/** @type {LearnerDiagnostics} */ (sco.learnerDiagnostics);
  const usedWitnessDraws=witnessDraws.slice(0,diagnostics.witnessDrawCount);
  const usedVerifyDraws=verifyDraws.slice(0,diagnostics.verifyDrawCount);
  const fastPathSuccess=!diagnostics.fallbackUsed&&diagnostics.degree===5&&
    diagnostics.quotientRank===5&&diagnostics.verificationPassed===true&&
    diagnostics.verificationSamples===726&&diagnostics.falseAcceptanceBound<=1e-10&&
    sco.queries<=44836;
  const output={
    sourceHash:sourcePromise.sourceHash,
    sourcePromise:{
      maskRank:sourcePromise.maskRank,
      tableTopCoefficient:'0x'+sourcePromise.tableTopCoefficient.toString(16).padStart(8,'0'),
      fixedDeterministicDegreeFive:true,
      jointRadicalCodimension:5
    },
    learner:{
      baselineQueryCap:72688,
      fastQueryCap:44110,
      verificationSamples:726,
      verifiedFastQueryCap:44836,
      capReductionPercent:(1-44836/72688)*100,
      witnessDrawCount:usedWitnessDraws.length,
      verifyDrawCount:usedVerifyDraws.length,
      witnessTapeSha256:createHash('sha256').update(JSON.stringify(usedWitnessDraws)).digest('hex'),
      verifyTapeSha256:createHash('sha256').update(JSON.stringify(usedVerifyDraws)).digest('hex'),
      falseAcceptanceBound:diagnostics.falseAcceptanceBound
    },
    fastPathSuccess,
    failureReason:fastPathSuccess?null:'The top-quintic fast-path acceptance conditions were not all met; inspect learnerDiagnostics.',
    sco,
    native,
    matchedTranscripts:true,
    drawTapes:{witness:usedWitnessDraws,verify:usedVerifyDraws}
  };
  fs.writeFileSync('sco-rankfive-top-quintic-output.json',JSON.stringify(output,null,2)+'\n');
  process.stdout.write('SCO_NATIVE_TOP_QUINTIC_RANK5 '+JSON.stringify(output)+'\n');
  if(!fastPathSuccess)process.exitCode=2;
  return output;
}

if(require.main===module){
  compare().catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={privateTable,verifySourcePromise,cloneTopQuinticFromHttp,compare};
