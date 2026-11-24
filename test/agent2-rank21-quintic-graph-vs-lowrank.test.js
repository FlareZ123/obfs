'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {applyLinear,makeLinearTransform}=
  require('../sims/compatible-permutation-linear-sandwich-blackbox');
const {inverseOfColumns}=require('../sims/sparse-triangular-fixedpoint-inversion');
const {invertByRandomAffineGraph}=
  require('../sims/random-affine-graph-flag-inversion');
const {invertLowRankPermutation}=
  require('../sims/affine-low-rank-oracle');

/** @param {number} seed @returns {()=>number} */
function seeded(seed){
  let state=seed>>>0;
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  };
}

/** @param {number} value @returns {number} */
function popcount(value){
  let count=0;
  for(let x=value>>>0;x!==0;x&=x-1)count++;
  return count;
}

/** @param {number[]} values @returns {number} */
function gf2Rank(values){
  const pivots=Array(32).fill(0);
  let rank=0;
  for(const value of values){
    let remaining=value>>>0;
    for(let bit=31;bit>=0&&remaining!==0;bit--){
      if(!((remaining>>>bit)&1))continue;
      if(pivots[bit])remaining=(remaining^pivots[bit])>>>0;
      else{
        pivots[bit]=remaining;
        rank++;
        break;
      }
    }
  }
  return rank;
}

/**
 * Build 21 independent degree-five leading monomials on seven low variables,
 * then add lower-degree triangular terms depending on all earlier inputs.
 * @param {number} seed
 * @returns {number[][]}
 */
function makeRank21Terms(seed){
  const next=seeded(seed);
  const topMasks=Array.from({length:128},(_,mask)=>mask)
    .filter(mask=>popcount(mask)===5);
  assert.equal(topMasks.length,21);
  assert.equal(topMasks.reduce((union,mask)=>union|mask,0),0x7f);
  /** @type {number[][]} */
  const terms=Array.from({length:32},()=>[]);
  for(let outputBit=7;outputBit<28;outputBit++){
    const selected=[topMasks[outputBit-7]];
    const seen=new Set(selected);
    for(let term=0;term<5;term++){
      const degree=2+(next()%3);
      let mask=0;
      while(popcount(mask)<degree){
        const inputBit=next()%outputBit;
        mask|=1<<inputBit;
      }
      if(!seen.has(mask)){
        seen.add(mask);
        selected.push(mask);
      }
    }
    terms[outputBit]=selected;
  }
  return terms;
}

/**
 * Evaluate a triangular permutation whose nonlinear output displacement has
 * rank 21. Every degree-five leading monomial is unique; lower-degree terms
 * make later gates depend on earlier output coordinates.
 * @param {number} input
 * @param {number[][]} terms
 * @returns {number}
 */
function rank21Triangular(input,terms){
  const x=input>>>0;
  let output=x;
  for(let outputBit=7;outputBit<28;outputBit++){
    let gate=0;
    for(const mask of terms[outputBit]){
      if((x&mask)===mask)gate^=1;
    }
    if(gate)output=(output^(2**outputBit))>>>0;
  }
  return output>>>0;
}

test('degree-five affine-flag graph inversion on rank-21 displacement (joint radical codim 7)',()=>{
  const terms=makeRank21Terms(0x5eed21);
  const topMasks=terms.slice(7,28).map(list=>list[0]);
  assert.equal(topMasks.length,21);
  assert.ok(topMasks.every(mask=>popcount(mask)===5));
  assert.equal(topMasks.reduce((union,mask)=>union|mask,0),0x7f);
  assert.ok(terms.slice(7,28).every(list=>
    list.slice(1).every(mask=>popcount(mask)<=4)
  ));

  // All 128 assignments to the seven nonlinear input coordinates suffice to
  // verify that the 21 output displacement coordinates span rank 21.
  const displacementValues=Array.from({length:128},(_,low)=>
    (rank21Triangular(low,terms)^low)>>>0
  );
  assert.equal(gf2Rank(displacementValues),21);

  const inputColumns=makeLinearTransform(0x12345678);
  const outputColumns=makeLinearTransform(0x9abcdef0);
  const inputInverse=inverseOfColumns(inputColumns);
  assert.ok(inputInverse,'input affine wrapper must be invertible');
  assert.ok(inverseOfColumns(outputColumns),'output affine wrapper must be invertible');
  const inputBias=0x13579bdf;
  const outputBias=0x2468ace0;

  /** @param {number} input @returns {number} */
  const oracle=input=>{
    const hidden=(applyLinear(inputColumns,input)^inputBias)>>>0;
    return (applyLinear(outputColumns,rank21Triangular(hidden,terms))^outputBias)>>>0;
  };
  /** @param {bigint} input @returns {bigint} */
  const bigOracle=input=>BigInt(oracle(Number(input)));

  // Eight held-out hidden targets cover all-one and seven distinct six-one
  // patterns on the seven nonlinear input coordinates.
  const hiddenTargets=[
    0x67aa29ff,0x628acbfe,0xfe1940fd,0xc1ece67b,
    0x3e411777,0x37fff36f,0xbd72765f,0x8721e5bf
  ];
  const expectedLowRankQueries=[
    121616,2082224,1771722,198219,959413,1343261,214296,1549526
  ];
  const expectedOrbitCalls=[
    121581,2082189,1771687,198184,959378,1343226,214261,1549491
  ];
  const firstSecret=inputInverse((hiddenTargets[0]^inputBias)>>>0);
  const firstTarget=oracle(firstSecret);

  // The current low-rank implementation retains its default rank-16 safety
  // cap. Explicit opt-in is required for the rank-21 research comparison.
  assert.throws(()=>invertLowRankPermutation(oracle,firstTarget,{
    bits:32,rankBound:21,sample:seeded(0x12345678)
  }),RangeError);

  /** @type {Array<{index:number,secret:string,target:string,graphQueries:number,lowRankQueries:number,orbitCalls:number}>} */
  const receipts=[];
  let totalGraphQueries=0;
  let totalLowRankQueries=0;
  for(let index=0;index<hiddenTargets.length;index++){
    const secret=inputInverse((hiddenTargets[index]^inputBias)>>>0);
    const target=oracle(secret);
    const lowRank=invertLowRankPermutation(oracle,target,{
      bits:32,
      rankBound:21,
      maxRankBound:21,
      sample:seeded(0x12345678),
      maxSamples:96
    });
    assert.equal(lowRank.preimage,secret);
    assert.equal(oracle(lowRank.preimage),target);
    assert.equal(lowRank.nullity,1);
    assert.equal(lowRank.samplingCalls,2);
    assert.equal(lowRank.orbitCalls,expectedOrbitCalls[index]);
    assert.equal(lowRank.cycleLength,expectedOrbitCalls[index]);
    assert.equal(lowRank.oracleCalls,expectedLowRankQueries[index]);

    const graph=invertByRandomAffineGraph(
      bigOracle,BigInt(target),32,5,{seed:0x5e21+index,delta:1e-8}
    );
    assert.equal(graph.input,BigInt(secret));
    assert.equal(graph.verified,true);
    assert.ok(graph.queries<lowRank.oracleCalls);

    totalGraphQueries+=graph.queries;
    totalLowRankQueries+=lowRank.oracleCalls;
    receipts.push({
      index,
      secret:'0x'+secret.toString(16).padStart(8,'0'),
      target:'0x'+target.toString(16).padStart(8,'0'),
      graphQueries:graph.queries,
      lowRankQueries:lowRank.oracleCalls,
      orbitCalls:lowRank.orbitCalls
    });
  }
  assert.equal(totalLowRankQueries,8240277);
  assert.ok(totalGraphQueries<totalLowRankQueries);

  process.stdout.write('OBFS_RANK21_QUINTIC_GRAPH_VS_LOWRANK '+JSON.stringify({
    targets:receipts.length,
    nonlinearOutputRank:21,
    topDegree:5,
    topSupportUnion:'0x7f',
    jointTopDerivativeRadicalCodimension:7,
    receipts,
    totalGraphQueries,
    totalLowRankQueries,
    graphAdvantage:totalLowRankQueries/totalGraphQueries,
    defaultRankBoundCap:16,
    explicitRankBound:21
  })+'\\n');
;
