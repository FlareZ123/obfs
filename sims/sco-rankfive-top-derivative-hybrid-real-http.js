'use strict';

const assert=require('node:assert/strict');
const {createHash,randomBytes}=require('node:crypto');
const fs=require('node:fs');
const pathModule=require('node:path');
const {Worker}=require('node:worker_threads');
const {privateSource,executeArm}=require('./sco-rankfive-arbitrary-table-real-http');
const {verifySourcePromise}=require('./sco-rankfive-top-quintic-real-http');
const {evaluateHybridModel}=require('./rankfive-top-derivative-projected-affine-hybrid-peer');

/** @typedef {{origin:string,method:string,credential:string}} Access */
/** @typedef {{kind:'projected-affine',bits:number,rank:5,table:number[],coordinates:number[],affineCorrections:number[]}|{kind:'anf',bits:number,lower:Array<[number,number]>,top:Array<[number,number]>,degree:4|5}} HybridModel */
/** @typedef {{fastPathSuccess:boolean,witnessStrategy:'six-direction'|'seven-direction-restart',witnessTrials:number,witnessTrialCap:number,witnessDrawCount:number,witnessProbability:number,witnessFailureBound:number,quotientRank:number|null,coordinateStrategy:'shift'|'signature'|null,fixedPairPassed:boolean|null,fastQueries:number,verificationQueries:number,verificationSamples:number,verificationCap:number,verificationDelta:number|null,falseAcceptanceBound:number|null,verificationPassed:boolean|null,verificationMode:'verify-degree-five'|'assume-projected-affine',promiseAssumed:boolean,verificationAttempted:boolean,fallbackUsed:boolean,fallbackReason:string|null,fallbackQueries:number,exactByInterpolation:boolean,verifyDrawCount?:number,verifierTapeReleasedAfterCandidate?:boolean}} HybridDiagnostics */
/** @typedef {(model:unknown,input:number)=>number} ModelEvaluator */
/** @typedef {{model:HybridModel,queries:number,transcriptSha256:string,diagnostics:HybridDiagnostics}} CloneResult */
/** @typedef {{
  replicate:number,
  baseline:{scoQueries:number,nativeQueries:number,transcriptSha256:string,drawCount:number,drawTapeSha256:string,draws:number[]},
  hybrid:{scoQueries:number,nativeQueries:number,transcriptSha256:string,diagnostics:HybridDiagnostics,witnessDrawTapeSha256:string,verifyDrawTapeSha256:string,witnessDraws:number[],verifyDraws:number[]},
}} ReplicateRecord */

class NeedHttpQuery extends Error {
  /** @param {number} input */
  constructor(input){
    super('The synchronous hybrid learner requested one missing HTTP oracle value');
    this.input=input>>>0;
  }
}

/**
 * Run the synchronous hybrid learner in a worker while the main thread serves
 * asynchronous authenticated HTTP requests. The same independent tapes are
 * replayed in both SCO and native arms.
 *
 * @param {Access} access
 * @param {number[]} witnessDraws
 * @param {number[]} verifyDraws
 * @param {'six-direction'|'seven-direction-restart'} [witnessStrategy]
 * @param {'verify-degree-five'|'assume-projected-affine'} [verificationMode]
 * @returns {Promise<CloneResult>}
 */
async function cloneHybridFromHttp(access,witnessDraws,verifyDraws,witnessStrategy='six-direction',verificationMode='verify-degree-five'){
  const expectedVerifierWords=verificationMode==='verify-degree-five'?726:0;
  assert.equal(verifyDraws.length,expectedVerifierWords,'The verifier tape length must match the selected verification mode');
  const sharedBuffer=new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT*2);
  const shared=new Int32Array(sharedBuffer);
  const verifyBuffer=new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT*(2+verifyDraws.length));
  const verifyShared=new Int32Array(verifyBuffer);
  const worker=new Worker(pathModule.join(__dirname,'rankfive-top-derivative-hybrid-http-worker.cjs'),{
    workerData:{sharedBuffer,witnessDraws,verifyBuffer,verifyCount:verifyDraws.length,witnessStrategy,verificationMode}
  });
  /** @type {Map<number,number>} */
  const seen=new Map();
  const transcript=createHash('sha256');
  return await new Promise((resolve,reject)=>{
    let settled=false;
    let candidateReadyCount=0;
    /** @type {unknown} */
    let failure=null;
    worker.on('message',async message=>{
      if(message.type==='query'){
        try{
          const input=message.input>>>0;
          assert.equal(message.sequence,seen.size,'hybrid worker query sequence is not monotonic');
          assert.ok(!seen.has(input),'hybrid worker requested a duplicate input despite its cache');
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
      }else if(message.type==='candidate-ready'){
        if(settled)return;
        try{
          assert.equal(verificationMode,'verify-degree-five',
            'The assumed-promise mode must not request verifier randomness');
          assert.equal(candidateReadyCount,0,'Verifier tape requested more than once');
          assert.equal(message.queryCount,seen.size,'Candidate-ready query count differs from the completed training transcript');
          assert.equal(Atomics.load(verifyShared,0),0,'Verifier tape was released before candidate construction');
          for(let index=0;index<verifyDraws.length;index++){
            Atomics.store(verifyShared,2+index,verifyDraws[index]>>>0);
          }
          Atomics.store(verifyShared,1,verifyDraws.length);
          Atomics.store(verifyShared,0,1);
          candidateReadyCount++;
          Atomics.notify(verifyShared,0);
        }catch(error){
          failure=error;
          Atomics.store(verifyShared,0,2);
          Atomics.notify(verifyShared,0);
        }
      }else if(message.type==='result'){
        if(settled)return;
        settled=true;
        try{
          if(verificationMode==='verify-degree-five') {
            assert.equal(candidateReadyCount,1,'Verifier tape was not released after a fixed candidate was constructed');
            assert.equal(Atomics.load(verifyShared,0),1);
            assert.equal(message.diagnostics.verifierTapeReleasedAfterCandidate,true);
          } else {
            assert.equal(candidateReadyCount,0,'Assumed-promise mode unexpectedly requested verifier randomness');
            assert.equal(Atomics.load(verifyShared,0),0);
            assert.equal(message.diagnostics.verifierTapeReleasedAfterCandidate,false);
          }
          assert.equal(message.queryCount,seen.size);
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
      reject(failure??new Error('Hybrid worker exited before returning a result (code '+code+')'));
    });
  });
}

/** @returns {number} */
function secureWord(){
  return randomBytes(4).readUInt32BE(0);
}

/** @param {number[]} values @returns {number} */
function mean(values){
  return values.reduce((sum,value)=>sum+value,0)/values.length;
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2===0?(sorted[middle-1]+sorted[middle])/2:sorted[middle];
}

/** @param {number[]} values @param {number} p @returns {number} */
function percentile(values,p){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.floor(p*(sorted.length-1)))];
}

/**
 * Execute baseline and exact-promise hybrid reconstructions over the same
 * frozen SCO/native HTTP source. The hybrid explicitly assumes the verified
 * projected-affine rank-five source promise and therefore consumes no verifier tape.
 *
 * @returns {Promise<object>}
 */
async function compare(){
  const replicates=10;
  const witnessStrategy='seven-direction-restart';
  const verificationMode='assume-projected-affine';
  const source=privateSource();
  const sourcePromise=verifySourcePromise(source);
  /** @type {ReplicateRecord[]} */
  const records=[];
  for(let replicate=0;replicate<replicates;replicate++){
    /** @type {number[]} */
    const baselineDraws=[];
    const baselineSco=await executeArm('sco',source,baselineDraws);
    const baselineNative=await executeArm('native',source,baselineDraws);
    assert.equal(baselineSco.sourceHash,sourcePromise.sourceHash);
    assert.equal(baselineNative.sourceHash,sourcePromise.sourceHash);
    assert.equal(baselineSco.queries,baselineNative.queries);
    assert.equal(baselineSco.transcriptSha256,baselineNative.transcriptSha256);
    assert.equal(baselineSco.heldouts,1024);
    assert.equal(baselineNative.heldouts,1024);
    assert.equal(baselineSco.deniedStatus,403);
    assert.equal(baselineNative.deniedStatus,403);
    assert.equal(baselineSco.publishedPrivateNames,false);
    assert.equal(baselineNative.publishedPrivateNames,false);

    /** @type {number[]} */
    const witnessDraws=Array.from({length:126},secureWord);
    /** @type {number[]} */
    const verifyDraws=[];
    /** @type {(access:Access,_unusedDraws:number[])=>Promise<CloneResult>} */
    const cloneRunner=(access,_unusedDraws)=>
      cloneHybridFromHttp(access,witnessDraws,verifyDraws,witnessStrategy,verificationMode);
    /** @type {ModelEvaluator} */
    const modelEvaluator=(model,input)=>
      evaluateHybridModel(/** @type {HybridModel} */ (model),input);
    const options={cloneRunner,modelEvaluator,maxQueries:1753};
    const hybridSco=await executeArm('sco',source,[],options);
    const hybridNative=await executeArm('native',source,[],options);
    assert.equal(hybridSco.sourceHash,sourcePromise.sourceHash);
    assert.equal(hybridNative.sourceHash,sourcePromise.sourceHash);
    assert.equal(hybridSco.queries,hybridNative.queries);
    assert.equal(hybridSco.transcriptSha256,hybridNative.transcriptSha256);
    assert.equal(hybridSco.heldouts,1024);
    assert.equal(hybridNative.heldouts,1024);
    assert.equal(hybridSco.deniedStatus,403);
    assert.equal(hybridNative.deniedStatus,403);
    assert.equal(hybridSco.publishedPrivateNames,false);
    assert.equal(hybridNative.publishedPrivateNames,false);
    assert.equal(hybridSco.offlineAfterServerClosed,true);
    assert.equal(hybridNative.offlineAfterServerClosed,true);
    assert.equal(hybridSco.privateExecutions,hybridSco.queries);
    assert.equal(hybridNative.privateExecutions,hybridNative.queries);
    assert.ok(hybridSco.learnerDiagnostics);
    assert.ok(hybridNative.learnerDiagnostics);
    assert.deepEqual(hybridSco.learnerDiagnostics,hybridNative.learnerDiagnostics);
    const diagnostics=/** @type {HybridDiagnostics} */ (hybridSco.learnerDiagnostics);
    assert.equal(diagnostics.fastPathSuccess,true,'Hybrid did not accept its fast path');
    assert.equal(diagnostics.witnessStrategy,witnessStrategy);
    assert.ok(diagnostics.witnessTrials<=diagnostics.witnessTrialCap);
    assert.equal(diagnostics.witnessTrialCap,18);
    assert.equal(diagnostics.witnessDrawCount,diagnostics.witnessTrials*7);
    assert.equal(diagnostics.witnessProbability,24519915/33554432);
    assert.equal(diagnostics.witnessFailureBound,
      Math.pow(1-diagnostics.witnessProbability,diagnostics.witnessTrialCap));
    assert.ok(diagnostics.witnessFailureBound<=1e-10);
    assert.equal(diagnostics.quotientRank,5);
    assert.equal(diagnostics.fallbackUsed,false);
    assert.equal(diagnostics.verificationMode,verificationMode);
    assert.equal(diagnostics.promiseAssumed,true);
    assert.equal(diagnostics.verificationAttempted,false);
    assert.equal(diagnostics.verificationPassed,null);
    assert.equal(diagnostics.verificationSamples,0);
    assert.equal(diagnostics.verificationQueries,0);
    assert.equal(diagnostics.verificationCap,0);
    assert.equal(diagnostics.falseAcceptanceBound,null);
    assert.equal(diagnostics.coordinateStrategy,'shift');
    assert.equal(diagnostics.fixedPairPassed,true);
    assert.equal(diagnostics.verifierTapeReleasedAfterCandidate,false);
    assert.equal(diagnostics.verifyDrawCount,0);
    assert.ok(hybridSco.queries<=1753);

    records.push({
      replicate,
      baseline:{
        scoQueries:baselineSco.queries,
        nativeQueries:baselineNative.queries,
        transcriptSha256:baselineSco.transcriptSha256,
        drawCount:baselineDraws.length,
        drawTapeSha256:createHash('sha256').update(JSON.stringify(baselineDraws)).digest('hex'),
        draws:baselineDraws
      },
      hybrid:{
        scoQueries:hybridSco.queries,
        nativeQueries:hybridNative.queries,
        transcriptSha256:hybridSco.transcriptSha256,
        diagnostics,
        witnessDrawTapeSha256:createHash('sha256').update(JSON.stringify(witnessDraws.slice(0,diagnostics.witnessDrawCount))).digest('hex'),
        verifyDrawTapeSha256:createHash('sha256').update(JSON.stringify(verifyDraws.slice(0,diagnostics.verificationSamples))).digest('hex'),
        witnessDraws:witnessDraws.slice(0,diagnostics.witnessDrawCount),
        verifyDraws:verifyDraws.slice(0,diagnostics.verificationSamples)
      },
    });
  }

  const baselineQueries=records.map(record=>record.baseline.scoQueries);
  const hybridQueries=records.map(record=>record.hybrid.scoQueries);
  const baselineMean=mean(baselineQueries);
  const hybridMean=mean(hybridQueries);
  const output={
    sourceHash:sourcePromise.sourceHash,
    sourcePromise:{
      maskRank:sourcePromise.maskRank,
      tableTopCoefficient:'0x'+sourcePromise.tableTopCoefficient.toString(16).padStart(8,'0'),
      fixedDeterministicDegreeFive:true,
      jointRadicalCodimension:5,
      exactProjectedAffinePromise:true
    },
    verificationMode,
    verifierSamples:0,
    replicates,
    baseline:{
      meanQueries:baselineMean,
      medianQueries:median(baselineQueries),
      p10Queries:percentile(baselineQueries,0.10),
      p90Queries:percentile(baselineQueries,0.90),
      p95Queries:percentile(baselineQueries,0.95),
      minQueries:Math.min(...baselineQueries),
      maxQueries:Math.max(...baselineQueries)
    },
    hybrid:{
      witnessStrategy,
      verificationMode,
      promiseAssumed:true,
      verifierSamples:0,
      queryCap:1753,
      meanQueries:hybridMean,
      medianQueries:median(hybridQueries),
      p10Queries:percentile(hybridQueries,0.10),
      p90Queries:percentile(hybridQueries,0.90),
      p95Queries:percentile(hybridQueries,0.95),
      minQueries:Math.min(...hybridQueries),
      maxQueries:Math.max(...hybridQueries)
    },
    comparison:{
      meanQueryDifference:baselineMean-hybridMean,
      meanReductionPercent:100*(baselineMean-hybridMean)/baselineMean,
      sampleDesign:'Baseline and hybrid use independently generated CSPRNG tapes; this is a descriptive independent-sample comparison, not matched-pair inference.'
    },
    records
  };
  fs.writeFileSync('sco-rankfive-top-derivative-hybrid-output.json',JSON.stringify(output,null,2)+'\n');
  const {records:unusedRecords,...compact}=output;
  void unusedRecords;
  console.log('SCO_NATIVE_TOP_DERIVATIVE_HYBRID '+JSON.stringify(compact));
  return output;
}

if(require.main===module){
  compare().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={cloneHybridFromHttp,compare};
