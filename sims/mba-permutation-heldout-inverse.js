'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {
  forwardChain,
  inverseChain,
  forwardRound,
  inverseRound
}=require('./mba-permutation-component-inverse');

/**
 * A deterministic byte stream for held-out research fixtures.
 * The seed was chosen only after the inverse implementation was committed as
 * d3edd8383572bc576d4be684a897d132c66b5e4b.
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
    const span=BigInt(maximum-minimum+1);
    return minimum+Number(this.word()%span);
  }
}

/**
 * Generate coefficients satisfying the same three parity conditions used by
 * the authors' generator.py.
 *
 * @param {HashStream} stream
 * @param {number} degree
 * @returns {bigint[]}
 */
function coefficients(stream,degree){
  const values=Array.from({length:degree+1},()=>stream.word());
  values[1]|=1n;

  let evenParity=0n;
  for(let index=2;index<=degree;index+=2)evenParity^=values[index]&1n;
  if(evenParity===1n)values[2]^=1n;

  let oddParity=0n;
  for(let index=3;index<=degree;index+=2)oddParity^=values[index]&1n;
  if(oddParity===1n)values[3]^=1n;
  return values;
}

/**
 * @typedef {import('./mba-permutation-component-inverse').MbaPermutationRound} MbaPermutationRound
 */

/**
 * @param {HashStream} stream
 * @param {{degree:number,xorOperands:number,cyclicOperands:number}} config
 * @returns {MbaPermutationRound}
 */
function round(stream,config){
  return {
    coefficients:coefficients(stream,config.degree),
    xorShifts:Array.from(
      {length:config.xorOperands-1},
      ()=>stream.integer(1,63)
    ),
    cyclicShifts:Array.from(
      {length:config.cyclicOperands},
      ()=>stream.integer(1,63)
    )
  };
}

/**
 * @param {HashStream} stream
 * @param {{degree:number,xorOperands:number,cyclicOperands:number,rounds:number}} config
 * @returns {MbaPermutationRound[]}
 */
function chain(stream,config){
  return Array.from({length:config.rounds},()=>round(stream,config));
}

const seed='heldout-after-d3edd838:2026-11-18:agent9:mba-component-inverse:v1';
const stream=new HashStream(seed);
const configs=[
  {degree:1,xorOperands:2,cyclicOperands:3,rounds:16},
  {degree:1,xorOperands:2,cyclicOperands:3,rounds:32},
  {degree:1,xorOperands:2,cyclicOperands:3,rounds:48},
  {degree:2,xorOperands:2,cyclicOperands:3,rounds:16},
  {degree:2,xorOperands:2,cyclicOperands:3,rounds:32},
  {degree:1,xorOperands:3,cyclicOperands:3,rounds:32},
  {degree:1,xorOperands:2,cyclicOperands:5,rounds:32},
  {degree:2,xorOperands:3,cyclicOperands:5,rounds:48}
];

/** @type {Array<Record<string,unknown>>} */
const results=[];
for(const config of configs){
  const rounds=chain(stream,config);
  const input=stream.word();
  const target=forwardChain(input,rounds);

  const started=performance.now();
  const recovered=inverseChain(target,rounds);
  const elapsedMs=performance.now()-started;

  assert.equal(recovered,input);
  assert.equal(forwardChain(recovered,rounds),target);

  // Also exercise each independently generated component round in isolation.
  const probe=stream.word();
  for(const oneRound of rounds.slice(0,Math.min(4,rounds.length))){
    assert.equal(inverseRound(forwardRound(probe,oneRound),oneRound),probe);
  }

  results.push({
    config:`${config.degree}-${config.xorOperands}-${config.cyclicOperands}-${config.rounds}`,
    input:'0x'+input.toString(16).padStart(16,'0'),
    target:'0x'+target.toString(16).padStart(16,'0'),
    recovered:'0x'+recovered.toString(16).padStart(16,'0'),
    inverseMs:elapsedMs,
    exact:true
  });
}

console.log(JSON.stringify({
  attackerCommit:'d3edd8383572bc576d4be684a897d132c66b5e4b',
  seed,
  cases:results.length,
  exactRecoveries:results.filter(result=>result.exact===true).length,
  results
},null,2));
