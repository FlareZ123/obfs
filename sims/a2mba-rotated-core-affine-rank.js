'use strict';

const assert = require('node:assert/strict');
const {
  nativeRegion32,
  makeRotatedCore32,
  rotateLeft32
} = require('./a2mba-rotated-core-int32-pilot');

/** @typedef {{rank:number,observations:number,seed:string}} ResidualRank */

/** @param {number} x @returns {[number,number,number,number]} */
function affineInputs(x) {
  return [
    x | 0,
    (rotateLeft32(x, 7) ^ 0x6c8e9cf5) | 0,
    (rotateLeft32(x, 13) ^ 0x13579bdf) | 0,
    (rotateLeft32(x, 19) ^ 0x2468ace0) | 0
  ];
}

/**
 * Project a four-input region to a fixed, public, affine 32-bit input slice.
 * @param {(x:number,y:number,z:number,t:number)=>number} fn
 * @returns {(x:number)=>number}
 */
function projectRegion(fn) {
  return x => fn(...affineInputs(x)) | 0;
}

/**
 * Compute the GF(2) rank of the nonlinear residual against the unique
 * affine interpolant agreeing with F(0) and all F(2^i).
 * A full-rank result is only a structural diagnostic, not an inversion bound.
 * @param {(input:number)=>number} fn
 * @param {number} [randomSamples]
 * @returns {ResidualRank}
 */
function nonlinearResidualRank(fn, randomSamples=4096) {
  const zero=fn(0) | 0;
  const differences=Array.from({length:32},(_,bit)=>(fn((1<<bit)|0)^zero)|0);
  /** @type {number[]} */
  const span=Array(32).fill(0);
  let rank=0, observations=0;

  /** @param {number} x */
  function observe(x) {
    let interpolated=zero;
    for(let bit=0;bit<32;bit++) {
      if((x>>>bit)&1)interpolated^=differences[bit];
    }
    let residual=(fn(x)|0)^interpolated;
    observations++;
    residual>>>=0;
    for(let bit=31;bit>=0;bit--) {
      if(((residual>>>bit)&1)===0)continue;
      if(span[bit])residual^=span[bit];
      else {
        span[bit]=residual>>>0;
        rank++;
        return;
      }
    }
  }

  for(let left=0;left<32;left++) {
    for(let right=left+1;right<32;right++) {
      observe(((1<<left)^(1<<right))|0);
    }
  }
  let state=0x71a3c9f5|0;
  for(let index=0;index<randomSamples;index++) {
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    observe(state|0);
  }
  return {rank,observations,seed:'0x71a3c9f5'};
}


/**
 * Measure residual rank over the entire four-word 128-bit input space.
 * @param {(a:number,b:number,c:number,d:number)=>number} fn
 * @param {number} [randomSamples]
 * @returns {ResidualRank}
 */
function nonlinearResidualRank128(fn,randomSamples=4096) {
  const zero=fn(0,0,0,0)|0;
  const axis=Array.from({length:128},(_,position)=>{
    const input=[0,0,0,0];
    input[position>>>5]=1<<(position&31);
    return (fn(input[0],input[1],input[2],input[3])^zero)|0;
  });
  /** @type {number[]} */
  const basis=Array(32).fill(0);
  let rank=0,observations=0;
  /** @param {[number,number,number,number]} input */
  function observe(input) {
    let interpolated=zero;
    for(let word=0;word<4;word++){
      for(let bit=0;bit<32;bit++) {
        if((input[word]>>>bit)&1)interpolated^=axis[word*32+bit];
      }
    }
    let residual=(fn(...input)^interpolated)>>>0;
    observations++;
    for(let bit=31;bit>=0;bit--){
      if(!((residual>>>bit)&1))continue;
      if(basis[bit])residual^=basis[bit];
      else {
        basis[bit]=residual;
        rank++;
        return;
      }
    }
  }
  for(let first=0;first<128;first++){
    for(let second=first+1;second<128;second++){
      /** @type {[number,number,number,number]} */
      const input=[0,0,0,0];
      input[first>>>5]|=1<<(first&31);
      input[second>>>5]|=1<<(second&31);
      observe(input);
    }
  }
  let state=0x71a3c9f5|0;
  for(let trial=0;trial<randomSamples;trial++){
    /** @type {[number,number,number,number]} */
    const input=[0,0,0,0];
    for(let word=0;word<4;word++){
      state^=state<<13;
      state^=state>>>17;
      state^=state<<5;
      input[word]=state|0;
    }
    observe(input);
  }
  return {rank,observations,seed:'0x71a3c9f5'};
}


/**
 * An independently checkable 32-pair certificate for full residual rank.
 * At z=t=0 the region equals (x+y) xor (x|y); its one-input restrictions
 * are zero. Pair x=y=2^i thus yields 3*2^i for i<31 and 2^31 for i=31.
 * Those 32 vectors form an upper-triangular GF(2) basis.
 * @returns {{pairs:number,rank:number}}
 */
function verifyFullRankCertificate() {
  /** @type {number[]} */
  const basis=Array(32).fill(0);
  let rank=0;
  for(let position=0;position<32;position++) {
    const unit=1<<position;
    const residual=(nativeRegion32(unit,unit,0,0)^
      nativeRegion32(unit,0,0,0)^nativeRegion32(0,unit,0,0)^
      nativeRegion32(0,0,0,0))|0;
    const formula=(((unit+unit)|0)^unit)|0;
    assert.equal(residual,formula);
    let value=residual>>>0;
    for(let bit=31;bit>=0;bit--) {
      if(!((value>>>bit)&1))continue;
      if(basis[bit])value^=basis[bit];
      else {
        basis[bit]=value;
        rank++;
        break;
      }
    }
  }
  assert.equal(rank,32);
  return {pairs:32,rank};
}

/** @param {number} x @returns {number} */
function rankOneShear(x) {
  return (x^(((x&1)&&((x>>>1)&1))?4:0))|0;
}

/** @param {number} x @returns {number} */
function rankTwoShear(x) {
  return (rankOneShear(x)^(((x>>>4)&1)&&((x>>>5)&1)?128:0))|0;
}

/**
 * @returns {{method:string,controls:{rankOne:ResidualRank,rankTwo:ResidualRank},
 *   baseline:ResidualRank,fullBaseline:ResidualRank,certificate:{pairs:number,rank:number},degenerateSlice:ResidualRank,rotations:Array<{rotation:number,rank:number,checked:number}>}}
 */
function runScreen() {
  const one=nonlinearResidualRank(rankOneShear);
  const two=nonlinearResidualRank(rankTwoShear);
  assert.equal(one.rank,1);
  assert.equal(two.rank,2);
  const plain=projectRegion(nativeRegion32);
  const baseline=nonlinearResidualRank(plain);
  const fullBaseline=nonlinearResidualRank128(nativeRegion32);
  const certificate=verifyFullRankCertificate();
  assert.equal(fullBaseline.rank,certificate.rank);
  const degenerateSlice=nonlinearResidualRank(x=>nativeRegion32(x,0,0,0));
  assert.equal(degenerateSlice.rank,0);
  /** @type {Array<{rotation:number,rank:number,checked:number}>} */
  const rotations=[];
  for(const rotation of [1,8,16,31]) {
    const candidate=projectRegion(makeRotatedCore32(rotation));
    let state=0x139ad17|0, checked=0;
    for(let index=0;index<10000;index++) {
      state^=state<<13;
      state^=state>>>17;
      state^=state<<5;
      assert.equal(candidate(state),plain(state));
      checked++;
    }
    const measured=nonlinearResidualRank(candidate);
    assert.deepEqual(measured,baseline);
    assert.deepEqual(nonlinearResidualRank128(makeRotatedCore32(rotation)),fullBaseline);
    rotations.push({rotation,rank:measured.rank,checked});
  }
  return {method:'GF(2) rank of F(x) xor affine interpolant on public 32-bit affine slice',
    controls:{rankOne:one,rankTwo:two},baseline,fullBaseline,certificate,degenerateSlice,rotations};
}

if(require.main===module)console.log(JSON.stringify(runScreen(),null,2));
module.exports={affineInputs,projectRegion,nonlinearResidualRank,nonlinearResidualRank128,verifyFullRankCertificate,runScreen};
