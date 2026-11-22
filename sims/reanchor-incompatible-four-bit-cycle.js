'use strict';

const assert=require('node:assert/strict');

/**
 * A reversible four-bit linear input wrapper. Column images of the standard
 * basis are [9, 2, 3, 12], all arithmetic in GF(2).
 * @param {number} x Four-bit value.
 * @returns {number}
 */
function linearInput(x) {
  return ((x&1?9:0)^(x&2?2:0)^(x&4?3:0)^(x&8?12:0))>>>0;
}

/**
 * A compatible permutation specified as its independent low-prefix Boolean
 * truth tables for output bits 1, 2, and 3. Table decimal 111 corresponds
 * to bits 01101111, indexed by the lower three input bits.
 * @param {number} z
 * @returns {number}
 */
function triangularOutput(z) {
  return z ^ (((1>>(z&1))&1)<<1) ^
    (((14>>(z&3))&1)<<2) ^ (((111>>(z&7))&1)<<3);
}

/** @param {number} x @returns {number} */
function oracle(x) {
  return triangularOutput(linearInput(x));
}

/**
 * @param {readonly number[]} columns
 * @param {number} input
 * @returns {number}
 */
function apply(columns,input) {
  let output=0;
  for(let index=0;index<columns.length;index++)
    if(input&(1<<index))output^=columns[index];
  return output>>>0;
}

/**
 * @param {(x:number)=>number} mapping
 * @param {number} anchor
 * @returns {number[]}
 */
function interpolate(mapping,anchor) {
  const base=mapping(anchor);
  return [1,2,4,8].map(direction=>mapping(anchor^direction)^base);
}

/**
 * Permutation of 16 source values and complete 16-anchor audit.
 * Every interpolant is either singular or has an incompatible hidden
 * source-coordinate map B=M*A^-1; no anchor meets the theorem's premise.
 *
 * @returns {{fullRank:number,singular:number,compatible:number}}
 */
function auditAllAnchors() {
  const A=[9,2,3,12];
  assert.equal(new Set(Array.from({length:16},(_,x)=>linearInput(x))).size,16);
  assert.equal(new Set(Array.from({length:16},(_,x)=>triangularOutput(x))).size,16);
  assert.equal(new Set(Array.from({length:16},(_,x)=>oracle(x))).size,16);
  /** @type {number[]} */
  const inverseInputBasis=[1,2,4,8].map(target=>{
    for(let x=0;x<16;x++)if(linearInput(x)===target)return x;
    throw new Error('The input map must be invertible');
  });
  let fullRank=0,singular=0,compatible=0;
  for(let anchor=0;anchor<16;anchor++){
    const M=interpolate(oracle,anchor);
    const images=new Set(Array.from({length:16},(_,x)=>apply(M,x)));
    if(images.size!==16){singular++;continue;}
    fullRank++;
    const B=inverseInputBasis.map(x=>apply(M,x));
    if(B.every((value,index)=>
      (value&((1<<(index+1))-1))===(1<<index)))compatible++;
  }
  return {fullRank,singular,compatible};
}

/**
 * At anchor 11, the observed interpolation is invertible, but the normal
 * n-1 fixed-point corrections cycle (14 -> 6 -> 9 -> 14) for target F(1)=5.
 *
 * @returns {{basis:number[],sourceBasis:number[],target:number,trajectory:number[]}}
 */
function nonConvergingTrajectory() {
  const anchor=11;
  const target=oracle(1);
  const M=interpolate(oracle,anchor);
  assert.deepEqual(M,[3,10,5,4]);
  const linearInverse=new Map(Array.from({length:16},(_,input)=>
    [apply(M,input),input]));
  assert.equal(linearInverse.size,16);
  /** @param {number} value @returns {number} */
  function inverseMatrix(value) {
    const input=linearInverse.get(value);
    if(input===undefined)throw new Error('Inverse matrix input was unavailable');
    return input;
  }
  let x=anchor^inverseMatrix(oracle(anchor)^target);
  const trajectory=[x];
  for(let step=0;step<3;step++){
    x^=inverseMatrix(oracle(x)^target);
    trajectory.push(x);
  }
  const A=[9,2,3,12];
  const inputBasisInverse=[1,2,4,8].map(output=>{
    for(let x=0;x<16;x++)if(apply(A,x)===output)return x;
    throw new Error('Input basis inverse not found');
  });
  const sourceBasis=inputBasisInverse.map(x=>apply(M,x));
  assert.deepEqual(sourceBasis,[15,10,8,12]);
  assert.equal(target,5);
  assert.deepEqual(trajectory,[14,6,9,14]);
  for(const x of trajectory)assert.notEqual(oracle(x),target);
  return {basis:M,sourceBasis,target,trajectory};
}

if(require.main===module) {
  process.stdout.write(JSON.stringify({
    audit:auditAllAnchors(),failure:nonConvergingTrajectory()
  })+'\n');
}

module.exports={linearInput,triangularOutput,oracle,interpolate,
  auditAllAnchors,nonConvergingTrajectory};
