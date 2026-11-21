'use strict';

const {randomInt}=require('node:crypto');

/** @typedef {(input:number)=>number} UInt32Oracle */
/** @typedef {{bits:number,rankBound:number,sample?:()=>number,maxSamples?:number}} InversionOptions */
/** @typedef {{preimage:number,oracleCalls:number,interpolationCalls:number,samplingCalls:number,orbitCalls:number,interpolantRank:number,nullity:number,cycleLength:number}} InversionResult */

/**
 * Evaluate a GF(2) linear map represented by its bit-column images.
 * All values are unsigned 32-bit integers, including when bits=32.
 * @param {number[]} columns
 * @param {number} input
 * @returns {number}
 */
function applyColumns(columns,input){
  let output=0;
  for(let bit=0;bit<columns.length;bit++){
    if((input>>>bit)&1)output=(output^columns[bit])>>>0;
  }
  return output;
}

/**
 * Extend an echelon basis only when a vector is independent.
 * @param {number[]} basis
 * @param {number} vector
 * @param {number} bits
 * @returns {boolean}
 */
function extendBasis(basis,vector,bits){
  let remaining=vector>>>0;
  for(let bit=bits-1;bit>=0;bit--){
    if(!((remaining>>>bit)&1))continue;
    if(basis[bit])remaining=(remaining^basis[bit])>>>0;
    else {
      basis[bit]=remaining;
      return true;
    }
  }
  return false;
}

/**
 * Invert an explicitly nonsingular square GF(2) bit-column matrix.
 * @param {number[]} columns
 * @returns {number[]}
 */
function inverseColumns(columns){
  const bits=columns.length;
  /** @type {{left:number,right:number}[]} */
  const rows=[];
  for(let row=0;row<bits;row++){
    let left=0;
    for(let column=0;column<bits;column++){
      if((columns[column]>>>row)&1)left=(left^(1<<column))>>>0;
    }
    rows.push({left,right:(1<<row)>>>0});
  }
  for(let pivot=0;pivot<bits;pivot++){
    let selected=pivot;
    while(selected<bits&&!((rows[selected].left>>>pivot)&1))selected++;
    if(selected===bits)throw new TypeError('Completion matrix is singular');
    [rows[selected],rows[pivot]]=[rows[pivot],rows[selected]];
    for(let row=0;row<bits;row++){
      if(row!==pivot&&((rows[row].left>>>pivot)&1)){
        rows[row].left=(rows[row].left^rows[pivot].left)>>>0;
        rows[row].right=(rows[row].right^rows[pivot].right)>>>0;
      }
    }
  }
  return Array.from({length:bits},(_,column)=>{
    let value=0;
    for(let row=0;row<bits;row++){
      if((rows[row].right>>>column)&1)value=(value^(1<<row))>>>0;
    }
    return value;
  });
}

/**
 * Invert one output of a promised GF(2)^n permutation of the form
 * F(x)=c XOR A*x XOR W*g(x), with A invertible, rank(W)<=rankBound,
 * and completely arbitrary g. Neither A, W nor g is supplied.
 *
 * The randomized phase completes a possibly singular affine interpolant.
 * Since F is bijective, uniform chosen inputs produce uniform residuals
 * modulo the interpolant image. Their span reaches the missing quotient
 * dimensions with probability one, using fewer than nullity+1.607 expected
 * samples. The final inverse search traverses a permutation orbit confined
 * to a coset containing at most 2**rankBound points.
 *
 * This is a chosen-input oracle attack, not a static reconstruction. The
 * practical implementation caps rankBound at 16 to bound worst-case work.
 * A custom sample callback is intended for deterministic reproducibility;
 * only the default crypto sampler carries the uniform-draw guarantee.
 *
 * @param {UInt32Oracle} oracle
 * @param {number} target
 * @param {InversionOptions} options
 * @returns {InversionResult}
 */
function invertLowRankPermutation(oracle,target,options){
  const {bits,rankBound}=options;
  if(!Number.isInteger(bits)||bits<1||bits>32||
     !Number.isInteger(rankBound)||rankBound<0||rankBound>Math.min(16,bits)){
    throw new RangeError('Expected 1..32 bits and rankBound 0..min(16,bits)');
  }
  const range=2**bits;
  const sample=options.sample??(()=>randomInt(range));
  const maxSamples=options.maxSamples??(bits+64);
  if(!Number.isInteger(maxSamples)||maxSamples<0)throw new RangeError('Invalid maxSamples');
  if(!Number.isInteger(target)||target<0||target>=range)throw new RangeError('Invalid target');
  let oracleCalls=0;
  /** @param {number} input @returns {number} */
  const query=input=>{
    oracleCalls++;
    const output=oracle(input);
    if(!Number.isInteger(output)||output<0||output>=range)
      throw new TypeError('Oracle must return unsigned n-bit integers');
    return output>>>0;
  };
  const constant=query(0);
  const columns=Array.from({length:bits},(_,bit)=>
    (query((1<<bit)>>>0)^constant)>>>0);
  const basis=Array(bits).fill(0);
  /** @type {number[]} */
  const freeColumns=[];
  for(let bit=0;bit<bits;bit++){
    if(!extendBasis(basis,columns[bit],bits))freeColumns.push(bit);
  }
  const nullity=freeColumns.length;
  if(nullity>rankBound)throw new RangeError('Oracle exceeds promised rank bound');
  /** @type {number[]} */
  const residuals=[];
  let samplingCalls=0;
  while(residuals.length<nullity){
    if(samplingCalls>=maxSamples)throw new Error('Uniform complement samples exhausted');
    const input=sample();
    if(!Number.isInteger(input)||input<0||input>=range)
      throw new RangeError('Sample outside n-bit domain');
    const residual=(query(input)^constant^applyColumns(columns,input))>>>0;
    samplingCalls++;
    if(extendBasis(basis,residual,bits))residuals.push(residual);
  }
  const completed=columns.slice();
  for(let i=0;i<freeColumns.length;i++){
    const column=freeColumns[i];
    completed[column]=(columns[column]^residuals[i])>>>0;
  }
  const inverse=inverseColumns(completed);
  const wanted=applyColumns(inverse,(target^constant)>>>0);
  let current=wanted;
  const maxOrbit=2**rankBound;
  for(let step=1;step<=maxOrbit;step++){
    const next=applyColumns(inverse,(query(current)^constant)>>>0);
    if(next===wanted){
      return {
        preimage:current,
        oracleCalls,
        interpolationCalls:bits+1,
        samplingCalls,
        orbitCalls:step,
        interpolantRank:bits-nullity,
        nullity,
        cycleLength:step
      };
    }
    current=next;
  }
  throw new RangeError('Oracle violates promised permutation or rank bound');
}

/**
 * Compute a one-sided certificate against a claimed low-rank output
 * perturbation model without knowledge of its hidden affine layers.
 *
 * For any representation F(x)=c XOR A*x XOR W*g(x) with invertible A,
 * every residual against the observed basis interpolant belongs to im(W).
 * The interpolant nullity is independently bounded above by rank(W).
 * Therefore max(nullity, observedResidualRank) is a sound LOWER bound on
 * rank(W), including when the function is not a permutation.
 *
 * A small observed bound does not prove a small actual rank. Unqueried
 * inputs can introduce arbitrarily many additional residual directions.
 *
 * @param {UInt32Oracle} oracle
 * @param {number} bits
 * @param {number[]} probeInputs
 * @returns {{
 *   minimumOutputRank:number,
 *   interpolantNullity:number,
 *   observedResidualRank:number,
 *   residualWitnesses:{input:number,residual:number}[],
 *   distinctOracleCalls:number
 * }}
 */
function auditObservedOutputRank(oracle,bits,probeInputs){
  if(!Number.isInteger(bits)||bits<1||bits>32)
    throw new RangeError('Expected 1..32 bits');
  const range=2**bits;
  /** @type {Map<number,number>} */
  const evaluated=new Map();
  /** @param {number} input @returns {number} */
  const query=input=>{
    if(!Number.isInteger(input)||input<0||input>=range)
      throw new RangeError('Probe outside unsigned n-bit domain');
    const cached=evaluated.get(input);
    if(cached!==undefined)return cached;
    const output=oracle(input);
    if(!Number.isInteger(output)||output<0||output>=range)
      throw new RangeError('Oracle output outside unsigned n-bit domain');
    evaluated.set(input,output>>>0);
    return output>>>0;
  };
  const origin=query(0);
  const columns=Array.from({length:bits},(_,bit)=>
    (query((1<<bit)>>>0)^origin)>>>0);
  const interpolantBasis=Array(bits).fill(0);
  let interpolantRank=0;
  for(const column of columns){
    if(extendBasis(interpolantBasis,column,bits))interpolantRank++;
  }
  const residualBasis=Array(bits).fill(0);
  /** @type {{input:number,residual:number}[]} */
  const residualWitnesses=[];
  for(const input of probeInputs){
    const residual=(query(input)^origin^applyColumns(columns,input))>>>0;
    if(extendBasis(residualBasis,residual,bits)){
      residualWitnesses.push({input,residual});
    }
  }
  const interpolantNullity=bits-interpolantRank;
  const observedResidualRank=residualWitnesses.length;
  return {
    minimumOutputRank:Math.max(interpolantNullity,observedResidualRank),
    interpolantNullity,observedResidualRank,residualWitnesses,
    distinctOracleCalls:evaluated.size
  };
}

module.exports={invertLowRankPermutation,auditObservedOutputRank};
