'use strict';

const WIDTH=64;
const WIDTH_BIGINT=64n;
const MASK=(1n<<WIDTH_BIGINT)-1n;

/**
 * @typedef {object} MbaPermutationRound
 * @property {bigint[]} coefficients Polynomial coefficients in ascending degree order.
 * @property {number[]} xorShifts Logical-right-shift distances from the author's xor-shift layer.
 * @property {number[]} cyclicShifts Rotate-left distances from the author's cyclic-XOR layer.
 */

/**
 * Reduce an integer to the unsigned 64-bit domain.
 * @param {bigint} value
 * @returns {bigint}
 */
function u64(value){
  return value&MASK;
}

/**
 * Evaluate the polynomial-XOR layer used by the public experiment generator:
 * c0 XOR c1*x XOR c2*x^2 ... modulo 2^64 for each product.
 *
 * @param {bigint} x
 * @param {bigint[]} coefficients
 * @returns {bigint}
 */
function polynomialPermutation(x,coefficients){
  let result=u64(coefficients[0]);
  let power=1n;
  for(let degree=1;degree<coefficients.length;degree++){
    power=u64(power*x);
    result^=u64(coefficients[degree]*power);
  }
  return u64(result);
}

/**
 * Invert a valid 64-bit polynomial-XOR permutation one output bit at a time.
 *
 * Multiplication modulo 2^64 is triangular in the input bits, so output bits
 * 0..k depend only on input bits 0..k. A permutation therefore has exactly
 * one choice for the next input bit at each prefix.
 *
 * @param {bigint} target
 * @param {bigint[]} coefficients
 * @returns {bigint}
 */
function invertPolynomialPermutation(target,coefficients){
  let x=0n;
  for(let bit=0;bit<WIDTH;bit++){
    const bitMask=(1n<<BigInt(bit+1))-1n;
    const candidate=x|(1n<<BigInt(bit));
    const zeroMatches=(polynomialPermutation(x,coefficients)&bitMask)===(target&bitMask);
    const oneMatches=(polynomialPermutation(candidate,coefficients)&bitMask)===(target&bitMask);
    if(zeroMatches===oneMatches){
      throw new Error('polynomial layer is not a triangular permutation for the supplied coefficients');
    }
    if(oneMatches)x=candidate;
  }
  return x;
}

/**
 * Evaluate x XOR (x >>> s1) XOR ... over unsigned 64-bit values.
 * @param {bigint} x
 * @param {number[]} shifts
 * @returns {bigint}
 */
function xorShiftPermutation(x,shifts){
  const value=u64(x);
  let result=value;
  for(const shift of shifts){
    result^=value>>BigInt(shift);
  }
  return u64(result);
}

/**
 * Invert the author's xor-shift layer from the most-significant bit down.
 * @param {bigint} target
 * @param {number[]} shifts
 * @returns {bigint}
 */
function invertXorShiftPermutation(target,shifts){
  let x=0n;
  for(let bit=WIDTH-1;bit>=0;bit--){
    let value=(target>>BigInt(bit))&1n;
    for(const shift of shifts){
      const sourceBit=bit+shift;
      if(sourceBit<WIDTH){
        value^=(x>>BigInt(sourceBit))&1n;
      }
    }
    x|=value<<BigInt(bit);
  }
  return x;
}

/**
 * Rotate an unsigned 64-bit value left.
 * @param {bigint} x
 * @param {number} shift
 * @returns {bigint}
 */
function rotateLeft64(x,shift){
  const amount=shift%WIDTH;
  const value=u64(x);
  if(amount===0)return value;
  const n=BigInt(amount);
  return u64((value<<n)|(value>>(WIDTH_BIGINT-n)));
}

/**
 * Evaluate the XOR of public 64-bit cyclic rotations.
 * @param {bigint} x
 * @param {number[]} shifts
 * @returns {bigint}
 */
function cyclicXorPermutation(x,shifts){
  let result=0n;
  for(const shift of shifts){
    result^=rotateLeft64(x,shift);
  }
  return u64(result);
}

/**
 * Invert the cyclic-XOR layer by solving its public 64x64 GF(2) linear map.
 * This deliberately does not depend on a closed-form inverse or hidden seed.
 *
 * @param {bigint} target
 * @param {number[]} shifts
 * @returns {bigint}
 */
function invertCyclicXorPermutation(target,shifts){
  /** @type {{coefficients:bigint,rhs:bigint}[]} */
  const rows=[];
  for(let outputBit=0;outputBit<WIDTH;outputBit++){
    let coefficients=0n;
    for(const shift of shifts){
      const inputBit=(outputBit-(shift%WIDTH)+WIDTH)%WIDTH;
      coefficients^=1n<<BigInt(inputBit);
    }
    rows.push({
      coefficients,
      rhs:(target>>BigInt(outputBit))&1n
    });
  }

  let pivotRow=0;
  for(let column=0;column<WIDTH;column++){
    let pivot=-1;
    for(let row=pivotRow;row<WIDTH;row++){
      if(((rows[row].coefficients>>BigInt(column))&1n)===1n){
        pivot=row;
        break;
      }
    }
    if(pivot<0){
      throw new Error('cyclic-XOR layer is singular for the supplied shifts');
    }
    [rows[pivotRow],rows[pivot]]=[rows[pivot],rows[pivotRow]];

    for(let row=0;row<WIDTH;row++){
      if(row!==pivotRow&&((rows[row].coefficients>>BigInt(column))&1n)===1n){
        rows[row].coefficients^=rows[pivotRow].coefficients;
        rows[row].rhs^=rows[pivotRow].rhs;
      }
    }
    pivotRow++;
  }

  let x=0n;
  for(let bit=0;bit<WIDTH;bit++){
    x|=rows[bit].rhs<<BigInt(bit);
  }
  return x;
}

/**
 * Evaluate one paper-style composition round.
 * @param {bigint} x
 * @param {MbaPermutationRound} round
 * @returns {bigint}
 */
function forwardRound(x,round){
  let value=polynomialPermutation(x,round.coefficients);
  value=xorShiftPermutation(value,round.xorShifts);
  return cyclicXorPermutation(value,round.cyclicShifts);
}

/**
 * Invert one paper-style composition round.
 * @param {bigint} target
 * @param {MbaPermutationRound} round
 * @returns {bigint}
 */
function inverseRound(target,round){
  let value=invertCyclicXorPermutation(target,round.cyclicShifts);
  value=invertXorShiftPermutation(value,round.xorShifts);
  return invertPolynomialPermutation(value,round.coefficients);
}

/**
 * Evaluate a sequence of public rounds.
 * @param {bigint} x
 * @param {MbaPermutationRound[]} rounds
 * @returns {bigint}
 */
function forwardChain(x,rounds){
  let value=u64(x);
  for(const round of rounds)value=forwardRound(value,round);
  return value;
}

/**
 * Recover the unique preimage of a public target by reversing the round order.
 * @param {bigint} target
 * @param {MbaPermutationRound[]} rounds
 * @returns {bigint}
 */
function inverseChain(target,rounds){
  let value=u64(target);
  for(let index=rounds.length-1;index>=0;index--){
    value=inverseRound(value,rounds[index]);
  }
  return value;
}

module.exports={
  MASK,
  polynomialPermutation,
  invertPolynomialPermutation,
  xorShiftPermutation,
  invertXorShiftPermutation,
  rotateLeft64,
  cyclicXorPermutation,
  invertCyclicXorPermutation,
  forwardRound,
  inverseRound,
  forwardChain,
  inverseChain
};
