'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {prepareLowRankBatchInverter}=require('../sims/agent20-lowrank-batch-index');

/**
 * Exact rank-deficiency fraction for m independent, uniform samples from
 * GF(2)^d. Fraction is not rounded or converted to Number.
 * @param {number} dimension
 * @param {number} draws
 * @returns {{bad:bigint,total:bigint}}
 */
function failureFraction(dimension,draws) {
  if(!Number.isSafeInteger(dimension)||dimension<0||dimension>32||
      !Number.isSafeInteger(draws)||draws<0||draws>128)
    throw new RangeError('Expected a dimension 0..32 and draws 0..128');
  const total=(1n<<BigInt(draws))**BigInt(dimension);
  if(draws<dimension)return {bad:total,total};
  const choices=1n<<BigInt(draws);
  let good=1n;
  for(let j=0;j<dimension;j++)good*=choices-(1n<<BigInt(j));
  return {bad:total-good,total};
}

/** @param {number} dimension @param {number[]} vectors @returns {boolean} */
function spans(dimension,vectors) {
  const basis=Array(dimension).fill(0);
  let rank=0;
  for(let v of vectors) {
    for(let bit=dimension-1;bit>=0&&v;bit--) {
      if(!((v>>>bit)&1))continue;
      if(basis[bit])v^=basis[bit];
      else {basis[bit]=v;rank++;break;}
    }
  }
  return rank===dimension;
}

/** @param {number} dimension @param {number} draws @returns {bigint} */
function countFailures(dimension,draws) {
  const choices=2**dimension;
  const outcomes=choices**draws;
  let failures=0n;
  for(let state=0;state<outcomes;state++) {
    let remaining=state;
    const vectors=[];
    for(let i=0;i<draws;i++) {
      vectors.push(remaining%choices);
      remaining=Math.floor(remaining/choices);
    }
    if(!spans(dimension,vectors))failures++;
  }
  return failures;
}

test('exact small-dimensional sampling failure distribution matches full enumeration',()=>{
  for(let dimension=0;dimension<=3;dimension++){
    const maxDraws=dimension<=2?6:5;
    for(let draws=0;draws<=maxDraws;draws++) {
      const {bad,total}=failureFraction(dimension,draws);
      assert.equal(total,BigInt(2**(dimension*draws)));
      assert.equal(bad,countFailures(dimension,draws),'d='+dimension+', m='+draws);
    }
  }
  assert.deepEqual(failureFraction(2,2),{bad:10n,total:16n});
});

test('default n+64 residual completion cap has < 2^-64 failure under permutation and uniform draws',()=>{
  for(let bits=1;bits<=32;bits++){
    for(let dimension=0;dimension<=Math.min(bits,16);dimension++) {
      const {bad,total}=failureFraction(dimension,bits+64);
      // Union bound: P[rank < d] <= (2^d - 1)*2^(-m) < 2^(d-m) <= 2^-64.
      assert.ok(bad*(1n<<64n)<total,'n='+bits+', d='+dimension);
    }
  }
});

test('user-specified short finite cap can have material failure probability',()=>{
  const fraction=failureFraction(4,8);
  // Exact 4x8 matrix rank failure: not a success guarantee from the rank promise.
  assert.equal(fraction.bad>0n,true);
  assert.equal(fraction.bad*100n>fraction.total,true);
  assert.equal(fraction.bad*100n<fraction.total*10n,true);
  assert.deepEqual(failureFraction(4,3),{bad:4096n,total:4096n});
  assert.throws(()=>failureFraction(33,80),RangeError);
  assert.throws(()=>failureFraction(4,129),RangeError);
});

test('default cryptographic sampler completes 256 independent singular-oracle trials',()=>{
  // The transposition (3 4) is an 8-point permutation, yet its affine
  // interpolant has columns [1,2,3] (nullity d=1) and its exact residual
  // image span is {0,7} (rank r=1). Four of eight uniform inputs yield
  // a new quotient direction; no scripted sampler is supplied.
  const values=[0,1,2,4,3,5,6,7];
  for(let trial=0;trial<256;trial++) {
    const inverter=prepareLowRankBatchInverter(x=>values[x],{
      bits:3,rankBound:1,completion:'sampled-residual'
    });
    const stat=inverter.stats();
    assert.equal(stat.interpolantNullity,1);
    assert.equal(stat.completion,'sampled-residual');
    assert.ok(stat.samplingCalls>=1&&stat.samplingCalls<=67);
    assert.equal(stat.orbitCap,2);
    for(let y=0;y<8;y++)
      assert.equal(values[inverter.invert(y).preimage],y);
    assert.equal(inverter.stats().totalCalls,8);
  }
});

test('sharp permutation-only finite cap failure bound is at most 2^-67 for n<=32',()=>{
  // F(0) and F(e_i) are n+1 DISTINCT values when F is bijective.
  // Thus the n columns M(e_i)=F(e_i)^F(0) are distinct nonzero vectors.
  // A rank-k binary subspace has at most 2^k-1 such vectors, forcing
  // rank(M)>=ceil(log2(n+1)) and d<=n-ceil(log2(n+1)).
  const denominator=1n<<67n;
  for(let bits=1;bits<=32;bits++){
    const minimumRank=Math.ceil(Math.log2(bits+1));
    const maxNullity=bits-minimumRank;
    const fraction=failureFraction(maxNullity,bits+64);
    assert.ok(fraction.bad*denominator<=fraction.total,
      'n='+bits+' feasible maximum nullity='+maxNullity);
    assert.equal(fraction.bad*denominator===fraction.total,bits===3,
      'Only n=3,d=1 attains the sharp bound');
  }
  assert.deepEqual(failureFraction(1,67),
    {bad:1n,total:1n<<67n});
});
