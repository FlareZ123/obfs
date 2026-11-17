'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {createBlindAffineChallenge}=require('./llm-blind-affine-challenge');
const {recover}=require('./polyvariant-affine-static-recover');
const {atomicWrite}=require('../src/atomic');

/** @typedef {'coo'|'sno'} Mode */
/** @typedef {{mode:Mode,sourceSha256:string,publishedSource:string,commitment:string,originalSource:string,salt:string,answer:Record<string,number>,attackerMs:number,emittedBytes:number,heldoutChecks:number}} Transcript */
/** @typedef {{samples:number,recoveredFunctions:number,heldoutChecks:number,medianAttackMs:number,minAttackMs:number,maxAttackMs:number,minEmittedBytes:number,maxEmittedBytes:number}} ModeSummary */

/** @param {string} value @returns {string} */
function hash(value){return createHash('sha256').update(value).digest('hex');}
/** @param {number[]} values @returns {number} */
function median(values){
  const numbers=[...values].sort((a,b)=>a-b);
  return numbers[Math.floor(numbers.length/2)];
}

/**
 * Attempt every unseen source without consulting private original/offsets.
 * The independent attack gets the public question only. A complete audit
 * transcript, including hidden source and salt, is assembled only after the
 * answer is irrevocably submitted to the one-shot verifier.
 *
 * @param {number} [runsPerMode]
 * @returns {Promise<{
 *   node:string,platform:NodeJS.Platform,
 *   privateSourceVaries:boolean,publishedSourceVaries:boolean,
 *   summaries:Record<Mode,ModeSummary>,
 *   transcripts:Transcript[],
 *   reviewer:'known-source-only-static-ast-negative-control',
 *   warning:string
 * }>}
 */
async function runEvidence(runsPerMode=12){
  if(!Number.isSafeInteger(runsPerMode)||runsPerMode<2||runsPerMode>100)
    throw new RangeError('Use between 2 and 100 independent source programs per mode');
  /** @type {Transcript[]} */
  const transcripts=[];
  const privateHashes=new Set();
  const publishedHashes=new Set();
  /** @type {Record<Mode,ModeSummary>} */
  const summaries={
    coo:{samples:0,recoveredFunctions:0,heldoutChecks:0,
      medianAttackMs:0,minAttackMs:0,maxAttackMs:0,
      minEmittedBytes:0,maxEmittedBytes:0},
    sno:{samples:0,recoveredFunctions:0,heldoutChecks:0,
      medianAttackMs:0,minAttackMs:0,maxAttackMs:0,
      minEmittedBytes:0,maxEmittedBytes:0}
  };
  for(const mode of /** @type {const} */(['coo','sno'])){
    /** @type {number[]} */
    const attackTimes=[];
    /** @type {number[]} */
    const emittedSizes=[];
    for(let iteration=0;iteration<runsPerMode;iteration++){
      const challenge=createBlindAffineChallenge(mode);
      const question=challenge.question;
      assert.equal(question.environment,mode);
      assert.equal(hash(question.source),question.sourceSha256);
      assert.deepEqual(question.exports,['round1','round2','round3']);
      assert.equal('originalSource' in question,false);
      assert.equal('offsets' in question,false);
      assert.throws(()=>challenge.reveal(),/Submit one answer/u);
      const started=performance.now();
      const answer=Object.fromEntries(question.exports.map(name=>{
        const result=recover(question.source,name,'module');
        assert.equal(result.cases,2);
        return [name,result.offset];
      }));
      const attackerMs=performance.now()-started;
      const verdict=challenge.verify(answer);
      assert.equal(verdict.passed,true,
        'Private original changed relative to public static reconstruction');
      assert.equal(verdict.comparisons,3072);
      const privateState=challenge.reveal();
      assert.equal(hash(privateState.salt+'\0'+privateState.originalSource),
        question.originalCommitment);
      assert.deepEqual(answer,privateState.offsets);
      assert.throws(()=>challenge.verify(answer),/only one answer/u);
      const originalSha=hash(privateState.originalSource);
      privateHashes.add(originalSha);
      publishedHashes.add(question.sourceSha256);
      const emittedBytes=Buffer.byteLength(question.source,'utf8');
      attackTimes.push(attackerMs);
      emittedSizes.push(emittedBytes);
      transcripts.push({
        mode,sourceSha256:question.sourceSha256,publishedSource:question.source,
        commitment:question.originalCommitment,
        originalSource:privateState.originalSource,salt:privateState.salt,
        answer,attackerMs,emittedBytes,heldoutChecks:verdict.comparisons
      });
    }
    summaries[mode]={
      samples:runsPerMode,recoveredFunctions:3*runsPerMode,
      heldoutChecks:3072*runsPerMode,
      medianAttackMs:median(attackTimes),
      minAttackMs:Math.min(...attackTimes),
      maxAttackMs:Math.max(...attackTimes),
      minEmittedBytes:Math.min(...emittedSizes),
      maxEmittedBytes:Math.max(...emittedSizes)
    };
  }
  assert.equal(privateHashes.size,runsPerMode*2,
    'Original source must genuinely vary across independently sampled challenges');
  assert.equal(publishedHashes.size,runsPerMode*2,
    'Distributed source must vary across independently sampled challenges');
  return {
    node:process.version,platform:process.platform,
    privateSourceVaries:true,publishedSourceVaries:true,
    summaries,transcripts,
    reviewer:'known-source-only-static-ast-negative-control',
    warning:'A known-family AST attacker recovered both modes. The experiment does not measure independent language-model attacker performance or general JS reconstruction resistance.'
  };
}

/**
 * The small human-readable summary omits original source. With
 * OBFS_BLIND_AUDIT_FILE set, write the complete post-answer audit transcript
 * atomically as a reproducible CI artifact.
 * @returns {Promise<void>}
 */
async function main(){
  const result=await runEvidence();
  if(process.env.OBFS_BLIND_AUDIT_FILE)
    await atomicWrite(process.env.OBFS_BLIND_AUDIT_FILE,
      JSON.stringify(result,null,2)+'\n');
  const {transcripts,...summary}=result;
  process.stdout.write('BLIND_AFFINE_PUBLIC_RECOVERY '+JSON.stringify({
    ...summary,
    examples:transcripts.map(({mode,sourceSha256,commitment,attackerMs,emittedBytes})=>({
      mode,sourceSha256,commitment,attackerMs,emittedBytes
    }))
  })+'\n');
}

if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={runEvidence,main};
