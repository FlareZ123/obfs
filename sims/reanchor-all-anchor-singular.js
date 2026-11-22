'use strict';

const assert=require('node:assert/strict');

/**
 * Invertible linear input mixing on the three low bits:
 * A(x0,x1,x2)=(x0 XOR x2, x1 XOR x2, x2).
 * The same map is its own inverse.
 *
 * @param {number} x Unsigned 32-bit input.
 * @returns {number}
 */
function sourceMix(x) {
  return (x ^ (((x>>>2)&1)*3))>>>0;
}

/**
 * Compatible, triangular, involutive permutation:
 * P(z0,z1,z2)=(z0,z1,z2 XOR ((1 XOR z0) AND (1 XOR z1))).
 *
 * @param {number} z Unsigned 32-bit input.
 * @returns {number}
 */
function triangularToggle(z) {
  return (z ^ ((z&3)===0?4:0))>>>0;
}

/**
 * A bijective three-low-bit oracle, embedded verbatim in 32 bits.
 * Its inverse is A(P(y)), verified in the tests.
 *
 * @param {number} x
 * @returns {number}
 */
function singularOracle(x) {
  return triangularToggle(sourceMix(x));
}

/**
 * @param {number} y
 * @returns {number}
 */
function invertSingularOracle(y) {
  return sourceMix(triangularToggle(y));
}

/**
 * Compute the external-basis finite-difference matrix columns of an oracle.
 * @param {(x:number)=>number} oracle
 * @param {number} anchor
 * @param {number} width 3 to 32
 * @returns {number[]}
 */
function interpolationColumns(oracle,anchor,width) {
  const base=oracle(anchor);
  return Array.from({length:width},(_,i)=>
    (oracle((anchor^(2**i))>>>0)^base)>>>0);
}

/**
 * Apply an n=3 linear map represented by its three column vectors.
 * @param {readonly number[]} columns
 * @param {number} x
 * @returns {number}
 */
function apply3(columns,x) {
  return ((x&1?columns[0]:0)^(x&2?columns[1]:0)^
    (x&4?columns[2]:0))>>>0;
}

/**
 * Enumerate the complete three-bit compatible-permutation family: arbitrary
 * Boolean lower-prefix toggles at bits 0, 1 and 2, respectively 1+2+4
 * bits of truth tables (128 total maps).
 *
 * @param {number} constant
 * @param {number} bitOneTable
 * @param {number} bitTwoTable
 * @param {number} value
 * @returns {number}
 */
function compatible3(constant,bitOneTable,bitTwoTable,value) {
  return value^constant^
    (((bitOneTable>>(value&1))&1)<<1)^
    (((bitTwoTable>>(value&3))&1)<<2);
}

/**
 * For every invertible 3x3 input matrix (168) and every compatible
 * three-bit permutation (128), classify how many of the eight ordinary
 * coordinate interpolation anchors have a hidden compatible invertible
 * basis. These source-known checks are separate from an attack routine.
 *
 * @returns {{maps:number,permutations:number,allEight:number,none:number,mixed:number,singularAnchors:number}}
 */
function censusThreeBitBases() {
  /** @type {number[][]} */
  const maps=[];
  for(let a=0;a<8;a++)for(let b=0;b<8;b++)for(let c=0;c<8;c++) {
    const columns=[a,b,c];
    const images=new Set(Array.from({length:8},(_,x)=>apply3(columns,x)));
    if(images.size===8)maps.push(columns);
  }
  assert.equal(maps.length,168);
  let allEight=0,none=0,mixed=0,singularAnchors=0;
  for(const columns of maps) {
    const inverseBasis=[1,2,4].map(target=>
      Array.from({length:8},(_,x)=>x).find(x=>apply3(columns,x)===target));
    assert.ok(inverseBasis.every(value=>value!==undefined));
    for(let constant=0;constant<2;constant++) {
      for(let tableOne=0;tableOne<4;tableOne++) {
        for(let tableTwo=0;tableTwo<16;tableTwo++) {
          let successes=0;
          for(let anchor=0;anchor<8;anchor++) {
            /** @param {number} x @returns {number} */
            const oracle=x=>compatible3(constant,tableOne,tableTwo,
              apply3(columns,x));
            const M=interpolationColumns(oracle,anchor,3);
            const rank=new Set(Array.from({length:8},(_,x)=>apply3(M,x))).size;
            if(rank!==8){singularAnchors++;continue;}
            const B=inverseBasis.map(input=>apply3(M,/** @type {number} */(input)));
            const compatible=B.every((image,i)=>
              (image&((1<<(i+1))-1))===(1<<i));
            if(compatible)successes++;
          }
          if(successes===8)allEight++;
          else if(successes===0)none++;
          else mixed++;
        }
      }
    }
  }
  return {maps:maps.length,permutations:128,allEight,none,mixed,singularAnchors};
}

/**
 * Self-contained source-pinned evidence executable under Node 22.
 * @returns {ReturnType<typeof censusThreeBitBases>}
 */
function main() {
  // Check every three-bit anchor and the exact inverse for each input.
  const outputs=new Set();
  for(let x=0;x<8;x++) {
    const y=singularOracle(x);
    outputs.add(y);
    assert.equal(invertSingularOracle(y),x);
    const M=interpolationColumns(singularOracle,x,3);
    assert.equal((M[0]^M[1]^M[2])>>>0,0);
    assert.equal(new Set(Array.from({length:8},(_,t)=>apply3(M,t))).size,4);
  }
  assert.equal(outputs.size,8);

  // The first three interpolated columns retain the same dependence
  // after embedding in 32 bits; remaining columns are identity.
  const anchors=[0,1,2,3,4,5,6,7,0x12345678,0x80000000,0xffffffff];
  for(const anchor of anchors) {
    const M=interpolationColumns(singularOracle,anchor,32);
    assert.equal((M[0]^M[1]^M[2])>>>0,0);
    assert.equal(invertSingularOracle(singularOracle(anchor)),anchor>>>0);
    for(let i=3;i<32;i++)assert.equal(M[i],(2**i)>>>0);
  }

  const counts=censusThreeBitBases();
  assert.deepEqual(counts,{
    maps:168,permutations:128,allEight:19968,none:1536,
    mixed:0,singularAnchors:12288
  });
  return counts;
}

if(require.main===module) {
  const counts=main();
  process.stdout.write(JSON.stringify({ok:true,counts})+'\n');
}

module.exports={sourceMix,triangularToggle,singularOracle,
  invertSingularOracle,interpolationColumns,censusThreeBitBases,main};
