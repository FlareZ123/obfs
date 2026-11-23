'use strict';

/** @typedef {{inputRows:number[],outputRows:number[],inputOffset:number,outputOffset:number,gateKeys:number[]}} HiddenAudit */
/** @typedef {{bits:number,evaluate:(input:number)=>number,audit:HiddenAudit}} HiddenOracle */

/** @param {number} value @returns {number} */
function mix32(value) {
  let x=value>>>0;
  x=Math.imul(x^(x>>>16),0x7feb352d)>>>0;
  x=Math.imul(x^(x>>>15),0x846ca68b)>>>0;
  return (x^(x>>>16))>>>0;
}

/** @param {number} seed @returns {()=>number} */
function sourceRandom(seed) {
  let state=(seed>>>0)||0x1234567;
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  };
}

/** @param {number} bits @returns {number} */
function widthMask(bits) {
  return bits===32?0xffffffff:((2**bits)-1)>>>0;
}

/** @param {number} value @returns {number} */
function bitParity(value) {
  let x=value>>>0;
  x^=x>>>16;
  x^=x>>>8;
  x^=x>>>4;
  return (0x6996>>>(x&15))&1;
}

/**
 * Start with I and use only invertible elementary row operations.
 * This guarantees that every returned binary matrix is invertible.
 * @param {number} bits
 * @param {()=>number} next
 * @returns {number[]}
 */
function invertibleRows(bits,next) {
  const rows=Array.from({length:bits},(_,i)=>(1<<i)>>>0);
  for(let step=0;step<bits*12;step++) {
    const i=next()%bits;
    const j=next()%bits;
    if(i===j)continue;
    if(next()&1)rows[i]=(rows[i]^rows[j])>>>0;
    else {
      const old=rows[i];
      rows[i]=rows[j];
      rows[j]=old;
    }
  }
  return rows;
}

/**
 * Apply a linear GF(2) map represented by its output-bit rows.
 * @param {number[]} rows
 * @param {number} input
 * @returns {number}
 */
function multiplyRows(rows,input) {
  let output=0;
  for(let i=0;i<rows.length;i++) {
    if(bitParity(rows[i]&input))output=(output|(1<<i))>>>0;
  }
  return output>>>0;
}

/**
 * Source-private family of affine-wrapped, bitwise-compatible permutations.
 * Each output bit j equals source bit j XOR an independent deterministic
 * mixer of strictly lower bits. Consequently the triangular middle map is
 * invertible for every seed; both affine wrapper matrices are invertible
 * by construction. The attacker module imports none of this fixture.
 *
 * The mixer and seeded draws are synthetic test design, not a secure PRF.
 * @param {number} bits
 * @param {number} seed
 * @returns {HiddenOracle}
 */
function makeDenseOracle(bits,seed) {
  if(!Number.isInteger(bits)||bits<1||bits>32)
    throw new RangeError('bits must be between 1 and 32');
  const next=sourceRandom(seed);
  const inputRows=invertibleRows(bits,next);
  const outputRows=invertibleRows(bits,next);
  const mask=widthMask(bits);
  const inputOffset=(next()&mask)>>>0;
  const outputOffset=(next()&mask)>>>0;
  const gateKeys=Array.from({length:bits},()=>next());

  /** @param {number} input @returns {number} */
  function evaluate(input) {
    const state=(multiplyRows(inputRows,input)^inputOffset)>>>0;
    let transformed=0;
    for(let j=0;j<bits;j++) {
      const low=state&((2**j)-1);
      const gate=mix32((low^gateKeys[j]^Math.imul(j+1,0x9e3779b9))>>>0)&1;
      const outputBit=((state>>>j)&1)^gate;
      if(outputBit)transformed=(transformed|(1<<j))>>>0;
    }
    return (multiplyRows(outputRows,transformed)^outputOffset)>>>0;
  }

  return {
    bits,evaluate,
    audit:{inputRows,outputRows,inputOffset,outputOffset,gateKeys}
  };
}

/**
 * Adversarial sparse source. Its high-bit gate triggers only on one lower-bit
 * prefix, while the output wrapper moves that gated bit to the public LSB.
 * The target is deliberately chosen inside the rare gate support. A sampled
 * false affine flag must be reported as unverified after its final oracle
 * equality check, not falsely accepted as an inversion.
 * @returns {{bits:number,secret:number,evaluate:(input:number)=>number}}
 */
function makeSparseWitness() {
  const bits=11,gateBit=8,prefix=0xfd;
  const secret=(prefix|(1<<gateBit)|(1<<10))>>>0;
  /** @param {number} input @returns {number} */
  function evaluate(input) {
    let value=input>>>0;
    if((value&((1<<gateBit)-1))===prefix)
      value=(value^(1<<gateBit))>>>0;
    const difference=((value>>>0)^(value>>>gateBit))&1;
    return (value^(difference|(difference<<gateBit)))>>>0;
  }
  return {bits,secret,evaluate};
}

/**
 * Invert a binary matrix (row representation) with exact GF(2) elimination.
 * This is a fixture-side reference operation only. The attack never uses it.
 * @param {number[]} input
 * @returns {number[]}
 */
function invertRows(input) {
  const bits=input.length;
  const left=input.slice();
  const right=Array.from({length:bits},(_,i)=>(1<<i)>>>0);
  for(let col=0;col<bits;col++) {
    let pivot=col;
    while(pivot<bits && !((left[pivot]>>>col)&1))pivot++;
    if(pivot===bits)throw new Error('Source matrix must be invertible');
    if(pivot!==col) {
      const l=left[col],r=right[col];
      left[col]=left[pivot];right[col]=right[pivot];
      left[pivot]=l;right[pivot]=r;
    }
    for(let row=0;row<bits;row++) {
      if(row===col || !((left[row]>>>col)&1))continue;
      left[row]=(left[row]^left[col])>>>0;
      right[row]=(right[row]^right[col])>>>0;
    }
  }
  return right;
}

/**
 * A second sparse failure source, at the same 32-bit width as the positive
 * tests. The protected triangular middle map toggles bit 27 only when its
 * lower 27 input bits match one private prefix (support density 2^-27).
 * The published target is selected from that support. Hidden full-rank
 * affine wrappers and their inverses remain fixture-side private state.
 * @param {number} seed
 * @returns {{bits:number,secret:number,evaluate:(input:number)=>number,
 *   audit:{gateBit:number,prefix:number}}}
 */
function makeRareAffineOracle(seed) {
  const bits=32,gateBit=27;
  const next=sourceRandom(seed);
  const inputRows=invertibleRows(bits,next);
  const outputRows=invertibleRows(bits,next);
  const inverseInputRows=invertRows(inputRows);
  const inputOffset=next(),outputOffset=next();
  const lowMask=widthMask(gateBit);
  const prefix=next()&lowMask;
  const hiddenState=(prefix|(next()&(~lowMask)))>>>0;
  const secret=multiplyRows(inverseInputRows,(hiddenState^inputOffset)>>>0);

  /** @param {number} input @returns {number} */
  function evaluate(input) {
    let z=(multiplyRows(inputRows,input)^inputOffset)>>>0;
    if((z&lowMask)===prefix)z=(z^(1<<gateBit))>>>0;
    return (multiplyRows(outputRows,z)^outputOffset)>>>0;
  }
  return {bits,secret,evaluate,audit:{gateBit,prefix}};
}

/**
 * Deterministically shuffled arbitrary permutation, used only as a negative
 * control for discovering genuine affine-derivative structure.
 * @param {number} bits
 * @param {number} seed
 * @returns {(input:number)=>number}
 */
function makeUnstructuredOracle(bits,seed) {
  if(!Number.isInteger(bits)||bits<1||bits>12)
    throw new RangeError('Shuffled-table control supports widths 1 through 12');
  const next=sourceRandom(seed);
  const values=Array.from({length:2**bits},(_,i)=>i);
  for(let i=values.length-1;i>0;i--) {
    const j=next()%(i+1);
    const tmp=values[i];
    values[i]=values[j];
    values[j]=tmp;
  }
  return input=>values[input];
}

module.exports={
  makeDenseOracle,makeSparseWitness,makeRareAffineOracle,makeUnstructuredOracle,
  sourceRandom,bitParity
};
