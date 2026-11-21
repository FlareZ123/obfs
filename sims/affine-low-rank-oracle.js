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
 * @typedef {{
 *   bits:number,rankBound:number,maxOrbitCalls?:number
 * }} DeterministicOptions
 * @typedef {{
 *   preimage:number,oracleCalls:number,interpolationCalls:number,
 *   orbitCalls:number,nullity:number,completionDirections:number,
 *   provenOrbitUpperBound:number
 * }} DeterministicInversionResult
 */

/**
 * Deterministically invert a promised permutation with output displacement
 * rank <= rankBound from a forward oracle, without random sampling.
 *
 * After n+1 queries form the public affine interpolant M. Replace each
 * dependent column M_i with M_i XOR e_j for a standard-basis direction e_j
 * outside the currently spanned columns. The completed H is invertible and
 * rank(H-M)<=d, where d is the observable nullity of M.
 *
 * The unknown nonlinear displacement D(x)=F(x) XOR F(0) XOR M*x lies in an
 * output subspace of dimension at most rankBound. Consequently
 * H^-1(F(x) XOR F(0)) XOR x lies in a fixed subspace of dimension <=r+d.
 * Iteration from H^-1(target XOR F(0)) stays in a permutation cycle of at
 * most min(2**bits,2**(r+d)) states and returns the exact predecessor.
 *
 * The promise cannot be certified from a few oracle queries. This routine
 * caps large orbits at 65,536 by default; a caller can explicitly increase
 * that limit for an expensive bound. A cap hit throws rather than guessing.
 *
 * @param {UInt32Oracle} oracle
 * @param {number} target
 * @param {DeterministicOptions} options
 * @returns {DeterministicInversionResult}
 */
function invertLowRankDeterministic(oracle,target,options){
  const {bits,rankBound}=options;
  if(!Number.isSafeInteger(bits)||bits<1||bits>32||
     !Number.isSafeInteger(rankBound)||rankBound<0||
     rankBound>Math.min(bits,16)){
    throw new RangeError('Expected 1..32 bits and rankBound 0..min(16,bits)');
  }
  const range=2**bits;
  if(!Number.isSafeInteger(target)||target<0||target>=range)
    throw new RangeError('Target outside n-bit domain');

  let oracleCalls=0;
  /** @param {number} input @returns {number} */
  const query=input=>{
    oracleCalls++;
    const value=oracle(input);
    if(!Number.isSafeInteger(value)||value<0||value>=range)
      throw new TypeError('Oracle must return unsigned n-bit integers');
    return value>>>0;
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

  const completed=columns.slice();
  for(const column of freeColumns){
    let filled=false;
    for(let bit=0;bit<bits;bit++){
      const direction=(1<<bit)>>>0;
      if(extendBasis(basis,direction,bits)){
        completed[column]=(columns[column]^direction)>>>0;
        filled=true;
        break;
      }
    }
    if(!filled)throw new Error('Could not extend affine interpolant');
  }
  const inverse=inverseColumns(completed);
  const provenOrbitUpperBound=2**Math.min(bits,rankBound+nullity);
  const maxOrbitCalls=options.maxOrbitCalls??
    Math.min(provenOrbitUpperBound,65536);
  if(!Number.isSafeInteger(maxOrbitCalls)||maxOrbitCalls<1||
     maxOrbitCalls>provenOrbitUpperBound){
    throw new RangeError('Invalid deterministic orbit call cap');
  }

  const wanted=applyColumns(inverse,(target^constant)>>>0);
  let current=wanted;
  for(let step=1;step<=maxOrbitCalls;step++){
    const next=applyColumns(inverse,(query(current)^constant)>>>0);
    if(next===wanted){
      return {
        preimage:current,oracleCalls,interpolationCalls:bits+1,
        orbitCalls:step,nullity,completionDirections:nullity,
        provenOrbitUpperBound
      };
    }
    current=next;
  }
  throw new RangeError('Deterministic orbit cap or rank promise exhausted');
}

module.exports={invertLowRankPermutation,invertLowRankDeterministic};

