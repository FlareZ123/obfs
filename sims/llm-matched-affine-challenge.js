'use strict';

const assert=require('node:assert/strict');
const {createHash,randomBytes,randomInt}=require('node:crypto');
const {transformSync}=require('esbuild');
const {obfuscateFiles}=require('../src');

const exportsList=Object.freeze(['round1','round2','round3']);

/**
 * Matched one-shot analysis questions from one hidden arithmetic source.
 * Both arms use identical target semantics, export names, and answer schemas.
 * A reviewing model should receive just one public question at a time, with
 * identical no-tools instructions and equal time budgets. The host keeps the
 * verifier alive, collects both committed answers, then reveals the arms.
 *
 * The generated source is a deliberately narrow Int32 translation family.
 * This protocol does not technically prevent a reviewer from visiting the
 * public repository; any no-repository claim needs a separate attestation.
 *
 * @typedef {'coo'|'sno'} Mode
 * @typedef {'generated'|'esbuild-minified'} Arm
 * @typedef {{
 *  source:string,
 *  sourceSha256:string,
 *  originalCommitment:string,
 *  environment:Mode,
 *  exports:string[],
 *  answerSchema:string,
 *  instruction:string
 * }} Question
 * @typedef {{passed:boolean,comparisons:number,claim:string}} Verdict
 */

/** @param {string} text @returns {string} */
function sha256(text){
  return createHash('sha256').update(text).digest('hex');
}

/**
 * @returns {{source:string,offsets:Record<string,number>}}
 */
function makePrivateSource(){
  /** @type {string[]} */
  const statements=[];
  /** @type {Record<string,number>} */
  const offsets=Object.create(null);
  for(const name of exportsList){
    let expression='(input|0)';
    let offset=0;
    for(let i=0;i<10;i++){
      const constant=randomInt(1,256);
      expression='('+expression+(i%2===0?'+':'-')+constant+')';
      offset+=i%2===0?constant:-constant;
    }
    offsets[name]=offset|0;
    statements.push('export function '+name+'(input){return ('+expression+'|0);}');
  }
  return {source:statements.join('\n'),offsets};
}

/**
 * @param {string} source
 * @param {string} commitment
 * @param {Mode} mode
 * @returns {Question}
 */
function question(source,commitment,mode){
  return {
    source,sourceSha256:sha256(source),
    originalCommitment:commitment,environment:mode,
    exports:[...exportsList],
    answerSchema:'JSON object {"round1": signedInt32, "round2": signedInt32, "round3": signedInt32}',
    instruction:'Using only this distributed ESM source, recover the signed Int32 translation offset k of each named export. Submit exactly one JSON answer with all three offsets. No original source, compiler internals, runtime oracle, or hidden evaluator is provided.'
  };
}

/**
 * @param {unknown} answer
 * @param {Record<string,number>} offsets
 * @returns {Verdict}
 */
function grade(answer,offsets){
  if(!answer||typeof answer!=='object'||Array.isArray(answer)){
    return {passed:false,comparisons:0,claim:'Malformed offset answer'};
  }
  const submitted=/** @type {Record<string,unknown>} */(answer);
  if(!exportsList.every(name=>typeof submitted[name]==='number'&&
     Number.isInteger(submitted[name])&&
     /** @type {number} */(submitted[name])>=-2147483648&&
     /** @type {number} */(submitted[name])<=2147483647)){
    return {passed:false,comparisons:0,claim:'Malformed offset answer'};
  }
  let comparisons=0;
  for(const name of exportsList){
    const guess=/** @type {number} */(submitted[name]);
    for(let i=0;i<1024;i++){
      const input=i<7?
        [-2147483648,-1,-0,0,1,2147483647,0x12345678][i]:
        Math.imul(i^0x43a97d21,0x9e3779b1)|0;
      if((((input|0)+guess)|0)!==(((input|0)+offsets[name])|0)){
        return {passed:false,comparisons,claim:'Held-out Int32 mismatch'};
      }
      comparisons++;
    }
  }
  return {passed:true,comparisons,claim:'Matched all three private arithmetic functions'};
}

/**
 * Produce an independently seeded, two-arm, one-shot model-reconstruction
 * challenge. Only the host can call verify/reveal; a reviewer sees a
 * serializable Question without the original source or the arm assignment.
 *
 * The host must disclose the equal-time protocol and source family before
 * review and record the actual model, prompts, attempts, latency, and tool use.
 * Randomized order cannot completely blind a reviewer to a visibly different
 * code representation.
 *
 * @param {Mode} [mode]
 * @returns {{
 *  questions:[Question,Question],
 *  verify:(answers:unknown)=>[Verdict,Verdict],
 *  reveal:()=>{salt:string,originalSource:string,offsets:Record<string,number>,
 *    commitment:string,arms:[Arm,Arm]}
 * }}
 */
function createMatchedBlindAffineChallenge(mode='coo'){
  if(mode!=='coo'&&mode!=='sno')throw new TypeError('Expected COO or SNO mode');
  const sourceData=makePrivateSource();
  const salt=randomBytes(16).toString('hex');
  const commitment=sha256(salt+'\0'+sourceData.source);
  const obfuscated=obfuscateFiles([{
    path:'blind-math.mjs',sourceType:'module',code:sourceData.source
  }],{
    mode,seed:randomBytes(16).toString('hex'),closedWorld:false,
    identifiers:false,properties:false,strings:false,
    experimentalPolyvariantAffine:{'blind-math.mjs':[...exportsList]},
    experimentalPolyvariantCount:2
  });
  assert.equal(obfuscated.files.length,1);
  assert.equal(obfuscated.files[0].metrics.polyvariantFunctions,3);
  assert.equal(obfuscated.files[0].metrics.polyvariantPaths,6);
  const generated=/** @type {string} */(obfuscated.files[0].code);
  const minified=transformSync(sourceData.source,{
    loader:'js',format:'esm',target:'es2022',minify:true,
    legalComments:'none'
  }).code;
  const arms=/** @type {[Arm,Arm]} */(
    randomInt(2)===0?['generated','esbuild-minified']:
      ['esbuild-minified','generated']
  );
  const questions=/** @type {[Question,Question]} */(
    arms.map(arm=>question(arm==='generated'?generated:minified,commitment,mode))
  );
  // The host may hand the same public question object to multiple
  // reviewers. Freeze its bytes, hashes, schema and two-arm ordering so an
  // accidental edit cannot silently invalidate the precommitted trial.
  for(const publicQuestion of questions){
    Object.freeze(publicQuestion.exports);
    Object.freeze(publicQuestion);
  }
  Object.freeze(questions);
  let submitted=false;
  return {
    questions,
    verify(answers){
      if(submitted)throw new Error('Matched challenge permits only one answer set');
      submitted=true;
      const values=Array.isArray(answers)?answers:[];
      return /** @type {[Verdict,Verdict]} */(
        questions.map((_,index)=>grade(values[index],sourceData.offsets))
      );
    },
    reveal(){
      if(!submitted)throw new Error('Submit both answers before source disclosure');
      return {
        salt,originalSource:sourceData.source,
        offsets:{...sourceData.offsets},commitment,
        arms:[...arms]
      };
    }
  };
}

module.exports={createMatchedBlindAffineChallenge};
