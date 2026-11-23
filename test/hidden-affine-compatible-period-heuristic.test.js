'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {solveLinear}=require('../sims/two-sided-affine-degree-inversion');
const {exactVectorAnfDegree}=require('../sims/permutation-degree-certification-lower-bound');
const {
  xorShift32,insertZeroBit,
  findCandidateAffineStructure,invertViaHiddenStructureHeuristic
}=require('../sims/hidden-affine-compatible-period-heuristic');

/** @param {number} bits @returns {number} */
function maskOf(bits){return bits===32?0xffffffff:(2**bits-1)>>>0;}
/** @param {number[]} columns @param {number} input @returns {number} */
function matrixProduct(columns,input) {
  let output=0;
  for(let i=0;i<columns.length;i++)
    if((input>>>i)&1)output^=columns[i];
  return output>>>0;
}
/** @param {number} bits @param {()=>number} next @returns {{columns:number[],bias:number}} */
function randomAffine(bits,next) {
  const columns=Array.from({length:bits},(_,i)=>(1<<i)>>>0);
  for(let i=0;i<12*bits;i++) {
    const a=next()%bits,b=next()%bits;
    if(a===b)continue;
    if(next()&1)columns[a]=(columns[a]^columns[b])>>>0;
    else [columns[a],columns[b]]=[columns[b],columns[a]];
  }
  return {columns,bias:(next()&maskOf(bits))>>>0};
}
/** @param {number} x @returns {number} */
function hash32(x) {
  let value=x>>>0;
  value^=value>>>16;value=Math.imul(value,0x7feb352d)>>>0;
  value^=value>>>15;value=Math.imul(value,0x846ca68b)>>>0;
  value^=value>>>16;
  return value>>>0;
}
/**
 * Independent source family: a true compatible permutation whose hidden
 * high-bit Boolean control is drawn from a full nonlinear 32-bit hash of
 * all lower coordinates, with unknown input and output affine matrices.
 *
 * @param {number} bits
 * @param {number} seed
 * @returns {{F:(input:number)=>number,inputPeriod:number,outputPeriod:number}}
 */
function makeHiddenCompatible(bits,seed) {
  const next=xorShift32(seed);
  const inner=randomAffine(bits,next),outer=randomAffine(bits,next);
  const keys=Array.from({length:bits},()=>next());
  /** @param {number} z @returns {number} */
  function triangular(z) {
    let transformed=z;
    for(let bit=0;bit<bits;bit++) {
      const lower=(z&((2**bit)-1))>>>0;
      if(hash32((lower^keys[bit])>>>0)&1)
        transformed^=(1<<bit);
    }
    return transformed>>>0;
  }
  /** @param {number} input @returns {number} */
  function F(input) {
    const inside=(matrixProduct(inner.columns,input)^inner.bias)>>>0;
    const output=(matrixProduct(outer.columns,triangular(inside))^outer.bias)>>>0;
    return (output&maskOf(bits))>>>0;
  }
  /** @type {{mask:number,rhs:number}[]} */
  const rows=Array.from({length:bits},(_,outputBit)=>{
    let mask=0;
    for(let inputBit=0;inputBit<bits;inputBit++){
      if((inner.columns[inputBit]>>>outputBit)&1)
        mask^=1<<inputBit;
    }
    return {mask:mask>>>0,rhs:outputBit===bits-1?1:0};
  });
  const inputPeriod=solveLinear(rows,bits);
  assert.notEqual(inputPeriod,null);
  const outputPeriod=matrixProduct(outer.columns,(1<<(bits-1))>>>0);
  assert.ok(outputPeriod!==0);
  return {
    F,inputPeriod:/** @type {number} */(inputPeriod),
    outputPeriod
  };
}

test('unknown two-affine compatible permutations possess a true full-width constant differential',()=>{
  for(const bits of [8,12,16,24,32]) {
    for(const seed of [1,7,31]) {
      const {F,inputPeriod,outputPeriod}=makeHiddenCompatible(bits,
        (0x33ceb9fe^bits^Math.imul(seed,0x9e3779b9))>>>0);
      assert.notEqual(inputPeriod,0);
      if(bits<=12) {
        for(let x=0;x<2**bits;x++)
          assert.equal((F(x)^F(x^inputPeriod))>>>0,outputPeriod);
      }else {
        const next=xorShift32((bits*13+seed)>>>0);
        for(let i=0;i<1024;i++) {
          const x=(next()&maskOf(bits))>>>0;
          assert.equal((F(x)^F(x^inputPeriod))>>>0,outputPeriod);
        }
      }
    }
  }
});

test('hidden-differential birthday heuristic recovers genuine periods and source-held inputs in sampled dense families',()=>{
  let successes=0,failedInversions=0;
  /** @type {{bits:number,queries:number,expectedPeriod:number,discoveredPeriod:number,inverseSuccess:boolean}[]} */
  const records=[];
  for(const [bits,seed,targets] of [[8,13,8],[12,79,8],[16,43,6],[20,125,4],[24,97,3]]) {
    const {F,inputPeriod,outputPeriod}=makeHiddenCompatible(bits,
      (0x1c3aade7^bits^Math.imul(seed,0x9e3779b9))>>>0);
    const period=findCandidateAffineStructure(F,bits,{
      seed:seed*3571,maxSamples:Math.ceil(8*2**(bits/2)),
      confirmationTrials:72
    });
    assert.ok(period,'Expected a period candidate for dense source width '+bits);
    assert.ok(period.inputDirection!==0);
    const next=xorShift32(seed^0x7137c0de);
    for(let t=0;t<512;t++){
      const x=(next()&maskOf(bits))>>>0;
      assert.equal((F(x)^F(x^period.inputDirection))>>>0,period.outputDifference,
        'Independent verifier must confirm sampled period on held-out points');
    }
    const input=(next()&maskOf(bits))>>>0;
    const target=F(input);
    const inverse=invertViaHiddenStructureHeuristic(F,target,bits,{
      seed:seed^0x7331,maxSamples:Math.ceil(8*2**(bits/2)),
      confirmationTrials:72
    });
    const inverseSuccess=inverse?.input===input;
    if(inverseSuccess)successes++;
    else failedInversions++;
    records.push({
      bits,queries:inverse?.oracleQueries??0,
      expectedPeriod:inputPeriod,discoveredPeriod:period.inputDirection,
      inverseSuccess
    });
    if(period.inputDirection===inputPeriod)
      assert.equal(period.outputDifference,outputPeriod);
  }
  console.log('HIDDEN_AFFINE_TRIANGULAR_PERIOD_HEURISTIC '+JSON.stringify({
    samples:records,successes,failedInversions
  }));
  // A randomized birthday attack is NOT a deterministic complete inverse
  // theorem. Retain any failed synthetic case as evidence rather than
  // treating passing exact identities as evidence of guaranteed recovery.
  assert.ok(successes>=2,'The heuristic should exhibit nontrivial recovery on dense examples');
});

test('high-degree sparse gate can spoof sampled affine periods: never call finite tests a certificate',()=>{
  const bits=16,prefix=(1<<15)-1,high=1<<15;
  /** @param {number} x @returns {number} */
  function rare(x) {
    return (x&((1<<15)-1))===prefix?(x^high)>>>0:x;
  }
  const candidate=findCandidateAffineStructure(rare,bits,{
    seed:417,maxSamples:512,confirmationTrials:40,
    exhaustiveAtOrBelow:11
  });
  assert.ok(candidate);
  assert.equal(candidate.exact,false,'Finite sample is not a complete proof');
  // Confirm the source is in fact much more nonlinear than the linear
  // period candidate would suggest. Some sampled directions can appear
  // affine on every tested input but fail at the rare source gate.
  const truePeriod=(candidate.inputDirection===high);
  if(!truePeriod) {
    const one=rare(prefix)^rare(prefix^candidate.inputDirection);
    const two=rare(prefix^high)^rare(prefix^high^candidate.inputDirection);
    // At least one exhaustive input witnesses a false scalar period.
    let mismatch=0;
    for(let x=0;x<2**bits;x++){
      if((rare(x)^rare(x^candidate.inputDirection))!==candidate.outputDifference) {
        mismatch++;break;
      }
    }
    assert.ok(mismatch>0);
    assert.ok(one!==candidate.outputDifference||two!==candidate.outputDifference);
  }
});

test('coordinate insertion has 32-bit high pivot boundary parity',()=>{
  for(let pivot=0;pivot<32;pivot++)for(let bit=0;bit<31;bit++) {
    const original=(1<<bit)>>>0;
    const expected=bit<pivot?original:((1<<(bit+1))>>>0);
    assert.equal(insertZeroBit(original,pivot),expected);
  }
});
