'use strict';

const assert=require('node:assert/strict');
const {createHash,randomBytes}=require('node:crypto');
const fs=require('node:fs');
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

class NeedQuery extends Error{
  /** @param {number} input */
  constructor(input){
    super('The top-quintic learner requested one missing HTTP oracle value');
    this.input=input>>>0;
  }
}

/** @returns {number} */
function secureWord(){
  return randomBytes(4).readUInt32BE(0);
}

/**
 * Drive the synchronous validated learner over the same real HTTP endpoint
 * using a persistent response cache and two independent replayable random
 * tapes. Tape indices reset after each missing-query restart.
 *
 * @param {Access} access
 * @param {number[]} witnessDraws
 * @param {number[]} verifyDraws
 * @returns {Promise<{model:unknown,queries:number,transcriptSha256:string,diagnostics:LearnerDiagnostics}>}
 */
async function cloneTopQuinticFromHttp(access,witnessDraws,verifyDraws){
  /** @type {Map<number,number>} */
  const seen=new Map();
  const transcript=createHash('sha256');
  for(;;){
    let witnessIndex=0;
    let verifyIndex=0;
    const drawWitness=()=>{
      if(witnessIndex===witnessDraws.length)witnessDraws.push(secureWord());
      return witnessDraws[witnessIndex++];
    };
    const drawVerify=()=>{
      if(verifyIndex===verifyDraws.length)verifyDraws.push(secureWord());
      return verifyDraws[verifyIndex++];
    };
    try{
      const model=/** @type {ValidatedModel} */ (cloneTopQuinticValidated(input=>{
        const key=input>>>0;
        if(!seen.has(key))throw new NeedQuery(key);
        return /** @type {number} */ (seen.get(key));
      },32,drawWitness,drawVerify,1e-10));
      assert.equal(model.queries,seen.size,'learner cache and authenticated query cache differ');
      assert.ok(model.queries<=44836||model.fallbackUsed,
        'fast path exceeded the preregistered 44,836 distinct-query cap');
      if(!model.fallbackUsed){
        assert.equal(model.degree,5);
        assert.equal(model.quotientRank,5);
        assert.equal(model.verificationPassed,true);
        assert.equal(model.verificationSamples,726);
        assert.ok(model.falseAcceptanceBound<=1e-10);
      }else{
        assert.equal(model.exactByInterpolation,true);
      }
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
        witnessDrawCount:witnessDraws.length,
        verifyDrawCount:verifyDraws.length
      };
      return {
        model,
        queries:seen.size,
        transcriptSha256:transcript.digest('hex'),
        diagnostics
      };
    }catch(error){
      if(!(error instanceof NeedQuery))throw error;
      const input=error.input;
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
    }
  }
}

/** @returns {Promise<object>} */
async function compare(){
  const source=privateSource();
  const sourcePromise=verifySourcePromise(source);
  /** @type {number[]} */
  const witnessDraws=[];
  /** @type {number[]} */
  const verifyDraws=[];
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
      witnessDrawCount:witnessDraws.length,
      verifyDrawCount:verifyDraws.length,
      witnessTapeSha256:createHash('sha256').update(JSON.stringify(witnessDraws)).digest('hex'),
      verifyTapeSha256:createHash('sha256').update(JSON.stringify(verifyDraws)).digest('hex'),
      falseAcceptanceBound:diagnostics.falseAcceptanceBound
    },
    fastPathSuccess,
    failureReason:fastPathSuccess?null:'The top-quintic fast-path acceptance conditions were not all met; inspect learnerDiagnostics.',
    sco,
    native,
    matchedTranscripts:true,
    drawTapes:{witness:witnessDraws,verify:verifyDraws}
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
