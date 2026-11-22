'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {transformSync}=require('esbuild');
const {recover}=require('./mba-permutation-minified-static-recovery');
const {forwardChain,inverseChain}=require('./mba-permutation-component-inverse');

const ATTACKER_COMMIT='14e580917902b747f416d773e0583f3410cbea17';
const SEED='heldout-after-14e580:2026-11-18:agent9:mba-minified-extractor:v1';

/**
 * @typedef {object} MbaPermutationRound
 * @property {bigint[]} coefficients
 * @property {number[]} xorShifts
 * @property {number[]} cyclicShifts
 */

class HashStream{
  /**
   * @param {string} seed
   */
  constructor(seed){
    this.seed=seed;
    this.counter=0;
  }

  /** @returns {bigint} */
  word(){
    const digest=createHash('sha256')
      .update(this.seed)
      .update(':')
      .update(String(this.counter++))
      .digest();
    return digest.readBigUInt64LE(0);
  }

  /**
   * @param {number} minimum
   * @param {number} maximum
   * @returns {number}
   */
  integer(minimum,maximum){
    return minimum+Number(this.word()%BigInt(maximum-minimum+1));
  }
}

/**
 * @param {HashStream} stream
 * @param {number} count
 * @returns {number[]}
 */
function shifts(stream,count){
  return Array.from({length:count},()=>stream.integer(1,63));
}

/**
 * @param {HashStream} stream
 * @returns {MbaPermutationRound}
 */
function round(stream){
  const constant=stream.word();
  const multiplier=stream.word()|1n;
  const xorCount=stream.integer(1,2);
  const cyclicCount=stream.integer(0,1)===0?3:5;
  return {
    coefficients:[constant,multiplier],
    xorShifts:shifts(stream,xorCount),
    cyclicShifts:shifts(stream,cyclicCount)
  };
}

/**
 * @param {MbaPermutationRound} oneRound
 * @param {number} rounds
 * @param {bigint} target
 * @param {number} variant
 * @returns {string}
 */
function sourceFor(oneRound,rounds,target,variant){
  const [constant,multiplier]=oneRound.coefficients;
  const helper=variant%2===0?
    "function r(x,s){x=BigInt.asUintN(64,x);return BigInt.asUintN(64,(x<<s)|(x>>(64n-s)));}":
    "const r=(x,s)=>BigInt.asUintN(64,(BigInt.asUintN(64,x)<<s)|(BigInt.asUintN(64,x)>>(64n-s)));";
  const polynomial=variant%3===0?
    `${constant}n^(${multiplier}n*x)`:
    `(x*${multiplier}n)^${constant}n`;
  const xorTerms=['x',...oneRound.xorShifts.map(shift=>`(x>>${shift}n)`)].join('^');
  const cyclic=oneRound.cyclicShifts.map(shift=>`r(x,${shift}n)`).join('^');
  const comparison=variant%2===0?`x===${target}n`:`${target}n===x`;
  return [
    "'use strict';",
    helper,
    "module.exports=function f(c){",
    "let x=BigInt.asUintN(64,BigInt(c));",
    `for(let i=0;i<${rounds};i++){`,
    `x=BigInt.asUintN(64,${polynomial});`,
    `x=BigInt.asUintN(64,${xorTerms});`,
    `x=${cyclic};`,
    "}",
    `return ${comparison};`,
    "};"
  ].join('\n');
}

const stream=new HashStream(SEED);
const roundChoices=[1,2,4,8,16,32,48];
/** @type {Array<Record<string,unknown>>} */
const results=[];

for(let index=0;index<20;index++){
  const oneRound=round(stream);
  const rounds=roundChoices[stream.integer(0,roundChoices.length-1)];
  const secret=stream.word();
  const chain=Array.from({length:rounds},()=>oneRound);
  const target=forwardChain(secret,chain);
  const source=sourceFor(oneRound,rounds,target,index);
  const minified=transformSync(source,{
    loader:'js',
    format:'cjs',
    target:'es2022',
    minify:true,
    legalComments:'none'
  }).code;

  const extracted=recover(minified);
  assert.equal(extracted.rounds,rounds);
  assert.deepEqual(extracted.coefficients,oneRound.coefficients);
  assert.deepEqual(extracted.xorShifts,oneRound.xorShifts);
  assert.deepEqual(extracted.cyclicShifts,oneRound.cyclicShifts);
  assert.equal(extracted.target,target);

  const recovered=inverseChain(
    extracted.target,
    Array.from({length:extracted.rounds},()=>({
      coefficients:extracted.coefficients,
      xorShifts:extracted.xorShifts,
      cyclicShifts:extracted.cyclicShifts
    }))
  );
  assert.equal(recovered,secret);

  results.push({
    index,
    rounds,
    xorTerms:oneRound.xorShifts.length+1,
    cyclicTerms:oneRound.cyclicShifts.length,
    minifiedBytes:Buffer.byteLength(minified),
    exactParameters:true,
    exactPreimage:true
  });
}

console.log(JSON.stringify({
  attackerCommit:ATTACKER_COMMIT,
  seed:SEED,
  cases:results.length,
  exactParameterRecoveries:results.filter(result=>result.exactParameters===true).length,
  exactPreimages:results.filter(result=>result.exactPreimage===true).length,
  results
},null,2));
