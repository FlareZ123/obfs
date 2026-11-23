'use strict';

const assert=require('node:assert/strict');
const {createHash,randomBytes,randomInt}=require('node:crypto');
const {obfuscateFiles}=require('../src');
const {transform,version:esbuildVersion}=require('esbuild');

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
    const constant=randomInt(1,256);
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
    experimentalPolyvariantAffine:{'blind-math.mjs':[...targets]},
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
      const allValid=targets.every(name=>{
        const value=object[name];
        return typeof value==='number'&&Number.isInteger(value)&&
          value>=-2147483648&&value<=2147483647;
      });
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

/**
 * @typedef {'candidate'|'control'} BlindArm
 * @typedef {{
 *   questions:{candidate:PublicQuestion,control:PublicQuestion},
 *   verify:(arm:BlindArm,answer:unknown)=>BlindVerdict,
 *   reveal:()=>{salt:string,originalSource:string,offsets:Record<string,number>,
 *     commitment:string,sourceHashes:Record<BlindArm,string>,preflightComparisons:number,
 *     candidateMetrics:{polyvariantFunctions:number,polyvariantPaths:number},
 *     minifier:{name:string,version:string,options:Record<string,unknown>}}
 * }} MatchedBlindChallenge
 */

/**
 * Generate a same-source, same-prompt pair for an independent two-reviewer
 * comparison: the candidate is emitted by the selected obfuscation backend;
 * the control is emitted by the pinned esbuild minifier. The two public
 * questions share a salted commitment but never expose private source or
 * offsets before one answer has been submitted for each arm.
 *
 * This helper is intentionally asynchronous because esbuild.transform is.
 * Reviewer isolation remains an external delivery requirement: do not publish
 * both questions or the private reveal in a public mailbox if strict blinding
 * is required.
 *
 * @param {Mode} [mode]
 * @returns {Promise<MatchedBlindChallenge>}
 */
async function createBlindAffineMatchedChallenge(mode='coo'){
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
    experimentalPolyvariantAffine:{'blind-math.mjs':[...targets]},
    experimentalPolyvariantCount:2
  });
  assert.equal(encoded.files.length,1);
  assert.equal(encoded.files[0].metrics.polyvariantFunctions,3,
    'Matched challenge candidate must protect three arithmetic leaves');
  assert.equal(encoded.files[0].metrics.polyvariantPaths,6);
  const candidateSource=/** @type {string} */(encoded.files[0].code);
  /** @type {import('esbuild').TransformOptions} */
  const minifierOptions={
    format:'esm',loader:'js',target:'es2022',minify:true,legalComments:'none'
  };
  const minified=await transform(originalSource,minifierOptions);
  const controlSource=minified.code;
  assert.ok(controlSource.length>0,'esbuild control must emit source');
  /** @param {string} source */
  const loadModule=source=>import('data:text/javascript;base64,'+
    Buffer.from(source).toString('base64'));
  const [nativeModule,candidateModule,controlModule]=await Promise.all([
    loadModule(originalSource),loadModule(candidateSource),loadModule(controlSource)
  ]);
  const preflightInputs=[
    -2147483648,-1,-0,0,1,2,3,2147483647,0x12345678
  ];
  for(let trial=0;trial<2048;trial++)
    preflightInputs.push(Math.imul(trial^0x43a97d21,0x9e3779b1)|0);
  let preflightComparisons=0;
  for(const name of targets){
    for(const input of preflightInputs){
      const expected=nativeModule[name](input);
      assert.equal(candidateModule[name](input),expected,
        'Polyvariant candidate failed native preflight for '+name);
      assert.equal(controlModule[name](input),expected,
        'esbuild control failed native preflight for '+name);
      preflightComparisons+=2;
    }
  }
  const common={
    originalCommitment:commitment,environment:mode,exports:[...targets],
    answerSchema:'JSON object {"round1": signedInt32, "round2": signedInt32, "round3": signedInt32}',
    instruction:'Analyze only this distributed ESM source. For each named exported function, recover the signed 32-bit offset k so f(x) === (((x|0)+k)|0) for all numeric x. Submit exactly one JSON answer. No native code, compiler seed, private evaluator, or runtime oracle is supplied.'
  };
  const questions={
    candidate:{
      ...common,source:candidateSource,sourceSha256:sha256(candidateSource)
    },
    control:{
      ...common,source:controlSource,sourceSha256:sha256(controlSource)
    }
  };
  for(const question of Object.values(questions)){
    Object.freeze(question.exports);
    Object.freeze(question);
  }
  Object.freeze(questions);
  /** @type {Set<BlindArm>} */
  const submitted=new Set();
  /** @type {Map<BlindArm,BlindVerdict>} */
  const verdicts=new Map();
  /**
   * @param {unknown} answer
   * @returns {BlindVerdict}
   */
  function verifyAnswer(answer){
    const object=answer&&typeof answer==='object'&&!Array.isArray(answer)?
      /** @type {Record<string,unknown>} */(answer):{};
    const allValid=targets.every(name=>{
      const value=object[name];
      return typeof value==='number'&&Number.isInteger(value)&&
        value>=-2147483648&&value<=2147483647;
    });
    if(!allValid)return {passed:false,comparisons:0,claim:'Malformed offset answer'};
    let comparisons=0;
    for(const name of targets){
      const guess=/** @type {number} */(object[name]);
      const expected=offsets[name];
      for(let trial=0;trial<1024;trial++){
        const input=trial<7?
          [-2147483648,-1,-0,0,1,2147483647,0x12345678][trial]:
          Math.imul(trial^0x43a97d21,0x9e3779b1)|0;
        if((((input|0)+guess)|0)!==(((input|0)+expected)|0))
          return {passed:false,comparisons,claim:'Held-out Int32 mismatch'};
        comparisons++;
      }
    }
    return {passed:true,comparisons,claim:'Matched all three private arithmetic functions'};
  }
  return {
    questions,
    verify(arm,answer){
      if(arm!=='candidate'&&arm!=='control')
        throw new TypeError('Expected candidate or control arm');
      if(submitted.has(arm))
        throw new Error('Matched blind challenge permits only one answer per arm');
      submitted.add(arm);
      const verdict=verifyAnswer(answer);
      verdicts.set(arm,verdict);
      return verdict;
    },
    reveal(){
      if(submitted.size!==2||verdicts.size!==2)
        throw new Error('Submit one answer for both arms before source disclosure');
      return {
        salt,originalSource,offsets:{...offsets},commitment,
        sourceHashes:{
          candidate:questions.candidate.sourceSha256,
          control:questions.control.sourceSha256
        },
        preflightComparisons,
        candidateMetrics:{
          polyvariantFunctions:/** @type {number} */(encoded.files[0].metrics.polyvariantFunctions),
          polyvariantPaths:/** @type {number} */(encoded.files[0].metrics.polyvariantPaths)
        },
        minifier:{name:'esbuild',version:esbuildVersion,options:{...minifierOptions}}
      };
    }
  };
}

module.exports={createBlindAffineChallenge,createBlindAffineMatchedChallenge};
