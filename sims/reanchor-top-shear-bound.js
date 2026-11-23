'use strict';

const {
  makeRng,makeLinearTransform,applyLinear,u32
}=require('./compatible-permutation-linear-sandwich-blackbox');
const {invertByReanchoring}=
  require('./random-affine-anchor-compatible-inversion');

/**
 * A triangular bijection with an affine lower 31-bit prefix and an
 * arbitrary nonlinear top bit. Its entire affine prefix may mix many
 * lower bits; the top output also depends on all those lower bits.
 * @param {number} input
 * @returns {number}
 */
function topShear(input) {
  const z=input>>>0;
  const affinePrefix=u32(z^((z<<3)&0x7fffffff)^((z<<7)&0x7fffffff));
  const nonlinear=(((z>>>30)&1)&((z>>>29)&1))^
    (((z>>>21)&1)&((z>>>17)&1))^
    (((z>>>5)&1)&((z>>>12)&1));
  return u32(affinePrefix^(nonlinear<<31)^0x12345678);
}

/**
 * A minimal top-bit AND shear that reaches the 35-query boundary.
 * @param {number} word
 * @returns {number}
 */
function tightTopShear(word) {
  const topToggle=((word>>>30)&1)&((word>>>29)&1);
  return u32(word^(topToggle<<31));
}

/**
 * Independent GF(2) column-rank verifier, solely for source-private
 * classification of expected success and failure conditions.
 * @param {number[]} columns
 * @returns {number}
 */
function rankColumns(columns) {
  const pivots=Array(32).fill(0);
  let rank=0;
  for(const column of columns) {
    let value=column>>>0;
    for(let bit=31;bit>=0;bit--) {
      if(((value>>>bit)&1)===0)continue;
      if(pivots[bit]!==0)value=u32(value^pivots[bit]);
      else {pivots[bit]=value;rank++;break;}
    }
  }
  return rank;
}

/**
 * Independent source oracle population with hidden input and output
 * dense affine wrappers, full 32-bit offsets, and arbitrary anchors.
 * A full-rank finite-difference matrix certifies compatibility in this
 * declared affine-prefix source family only.
 * @returns {{sources:number,bases:number,fullRank:number,singular:number,
 *   exact:number,maxQueries:number,maxCorrections:number,
 *   correctionsHistogram:Record<string,number>,tightQueries:number,
 *   tightCorrections:number,tightValue:number}}
 */
function runEvidence() {
  /** @type {Record<string,number>} */
  const correctionsHistogram={};
  let bases=0,fullRank=0,singular=0,exact=0,maxQueries=0,maxCorrections=0;
  for(let sourceIndex=0;sourceIndex<24;sourceIndex++) {
    const seed=u32(0x21a5f68d^Math.imul(sourceIndex+1,0x9e3779b9));
    const lin=makeLinearTransform(seed^0x6a09e667);
    const lout=makeLinearTransform(seed^0xbb67ae85);
    const next=makeRng(seed^0x3c6ef372);
    const inputOffset=next(),outputOffset=next();
    /** @param {number} x @returns {number} */
    const oracle=x=>u32(
      applyLinear(lout,topShear(u32(applyLinear(lin,x)^inputOffset)))^
      outputOffset);
    for(let sample=0;sample<16;sample++) {
      const anchor=next(),secret=next();
      const base=oracle(anchor);
      const columns=Array.from({length:32},(_,bit)=>
        u32(oracle(u32(anchor^(2**bit)))^base));
      const rank=rankColumns(columns);
      bases++;
      if(rank!==32) {
        singular++;
        continue;
      }
      const target=oracle(secret);
      const recovered=invertByReanchoring(oracle,target,()=>anchor,1,false);
      if(recovered.value!==secret)throw Error('Full-rank top-shear inversion failed');
      if(recovered.queries>35||recovered.corrections>1) {
        throw Error('Affine-prefix source exceeded 35-call/one-correction limit');
      }
      exact++;
      fullRank++;
      maxQueries=Math.max(maxQueries,recovered.queries);
      maxCorrections=Math.max(maxCorrections,recovered.corrections);
      const key=String(recovered.corrections);
      correctionsHistogram[key]=(correctionsHistogram[key]||0)+1;
    }
  }

  // Purely nonlinear top-bit example: 33 distinct interpolation points,
  // first wrong candidate, corrected second candidate = 35 distinct.
  const secret=0xe0000000;
  const target=tightTopShear(secret);
  const tight=invertByReanchoring(tightTopShear,target,0,1);
  return {sources:24,bases,fullRank,singular,exact,maxQueries,
    maxCorrections,correctionsHistogram,tightQueries:tight.queries,
    tightCorrections:tight.corrections,tightValue:tight.value};
}

if(require.main===module)console.log('REANCHOR_TOP_SHEAR '+JSON.stringify(runEvidence()));
module.exports={topShear,tightTopShear,rankColumns,runEvidence};
