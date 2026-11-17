'use strict';

const assert=require('node:assert/strict');
const {createHash,randomBytes,randomInt}=require('node:crypto');
const {obfuscateFiles}=require('../src');

const targets=Object.freeze(['round1','round2','round3']);

/**
 * A blind one-shot challenge intended for an *independent* reviewing model.
 * The recipient gets only question, never the private source or the expected
 * additive offsets before the answer is submitted. The reviewing model must
 * not have separate repository access for this to be a blind experiment.
 *
 * @typedef {'coo'|'sno'} Mode
 * @typedef {{
 *   source:string,
 *   sourceSha256:string,
 *   originalCommitment:string,
 *   environment:Mode,
 *   exports:string[],
 *   answerSchema:string,
 *   instruction:string
 * }} PublicQuestion
 * @typedef {{passed:boolean,comparisons:number,claim:string}} BlindVerdict
 */

/** @param {string} value @returns {string} */
function sha256(value){return createHash('sha256').update(value).digest('hex');}

/**
 * @param {string} name
 * @returns {{code:string,offset:number}}
 */
function privateAffine(name){
  let expression='(input|0)';
  let offset=0;
  for(let operation=0;operation<10;operation++){
    const constant=randomInt(1,512);
    const sign=operation%2===0?'+':'-';
    expression='('+expression+sign+constant+')';
    offset+=operation%2===0?constant:-constant;
  }
  return {code:'export function '+name+'(input){return ('+expression+'|0);}',
    offset:offset|0};
}

/**
 * Keep source generation and answer checking in the same private closure.
 * This returns a portable JSON question and a strictly one-shot local
 * verifier. The answer format accepts data only, not executable JS.
 *
 * @param {Mode} [mode]
 * @returns {{question:PublicQuestion,verify:(answer:unknown)=>BlindVerdict,reveal:()=>{salt:string,originalSource:string,offsets:Record<string,number>,commitment:string}}}
 */
function createBlindAffineChallenge(mode='coo'){
  if(mode!=='coo'&&mode!=='sno')throw new TypeError('Expected COO or SNO mode');
  const originals=targets.map(privateAffine);
  const originalSource=originals.map(item=>item.code).join('\n');
  /** @type {Record<string,number>} */
  const offsets=Object.fromEntries(targets.map((name,index)=>[name,originals[index].offset]));
  const salt=randomBytes(16).toString('hex');
  const commitment=sha256(salt+'\0'+originalSource);
  const encoded=obfuscateFiles([{
    path:'blind-math.mjs',sourceType:'module',code:originalSource
  }],{
    mode,seed:randomBytes(16).toString('hex'),closedWorld:false,
    identifiers:false,properties:false,strings:false,
    experimentalPolyvariantAffine:{'blind-math.mjs':targets},
    experimentalPolyvariantCount:2
  });
  assert.equal(encoded.files.length,1);
  assert.equal(encoded.files[0].metrics.polyvariantFunctions,3,
    'Blind challenge must actually protect three arithmetic leaves');
  assert.equal(encoded.files[0].metrics.polyvariantPaths,6);
  const source=/** @type {string} */(encoded.files[0].code);
  const question={
    source,sourceSha256:sha256(source),originalCommitment:commitment,
    environment:mode,exports:[...targets],
    answerSchema:'JSON object {"round1": signedInt32, "round2": signedInt32, "round3": signedInt32}',
    instruction:'Analyze only this distributed ESM source. For each named exported function, recover the signed 32-bit offset k so f(x) === (((x|0)+k)|0) for all numeric x. Submit exactly one JSON answer. No native code, compiler seed, private evaluator, or runtime oracle is supplied.'
  };
  let submitted=false;
  /** @type {BlindVerdict|undefined} */
  let verdict;
  return {
    question,
    verify(answer){
      if(submitted)throw new Error('Blind challenge permits only one answer');
      submitted=true;
      const object=answer&&typeof answer==='object'&&!Array.isArray(answer)?
        /** @type {Record<string,unknown>} */(answer):{};
      const allValid=targets.every(name=>Number.isInteger(object[name])&&
        /** @type {number} */(object[name])>=-2147483648&&
        /** @type {number} */(object[name])<=2147483647);
      if(!allValid){
        verdict={passed:false,comparisons:0,claim:'Malformed offset answer'};
        return verdict;
      }
      let comparisons=0;
      for(const name of targets){
        const guess=/** @type {number} */(object[name]);
        const expected=offsets[name];
        for(let trial=0;trial<1024;trial++){
          const input=trial<7?
            [-2147483648,-1,-0,0,1,2147483647,0x12345678][trial]:
            Math.imul(trial^0x43a97d21,0x9e3779b1)|0;
          if((((input|0)+guess)|0)!==(((input|0)+expected)|0)){
            verdict={passed:false,comparisons,claim:'Held-out Int32 mismatch'};
            return verdict;
          }
          comparisons++;
        }
      }
      verdict={passed:true,comparisons,claim:'Matched all three private arithmetic functions'};
      return verdict;
    },
    reveal(){
      if(!submitted||!verdict)throw new Error('Submit one answer before source disclosure');
      return {salt,originalSource,offsets:{...offsets},commitment};
    }
  };
}

module.exports={createBlindAffineChallenge};
