'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {applyLinear,makeLinearTransform}=
  require('../sims/compatible-permutation-linear-sandwich-blackbox');
const {inverseOfColumns}=
  require('../sims/sparse-triangular-fixedpoint-inversion');
const {invertByRandomAffineGraph}=
  require('../sims/random-affine-graph-flag-inversion');
const {learnFlag}=
  require('../sims/affine-flag-oracle-attacker');

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
 * Same source fixture as the graph-vs-low-rank comparison: 21 independent
 * degree-five leading monomials plus lower-degree triangular terms.
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
 * Evaluate the 32-bit triangular permutation.
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

test('sampled differential-flag learner versus graph inversion on the same rank-21 source',()=>{
  const terms=makeRank21Terms(0x5eed21);
  assert.ok(terms.slice(7,28).every(list=>list.length===6));
  assert.ok(terms.slice(7,28).every(list=>list[0]!==0&&popcount(list[0])===5));
  assert.ok(terms.slice(7,28).every(list=>
    list.slice(1).every(mask=>popcount(mask)<=4)
  ));
  const displacementValues=Array.from({length:128},(_,low)=>
    (rank21Triangular(low,terms)^low)>>>0
  );
  assert.equal(gf2Rank(displacementValues),21);

  const wrappers=[
    {inputSeed:0x12345678,outputSeed:0x9abcdef0,inputBias:0x13579bdf,outputBias:0x2468ace0},
    {inputSeed:0x31415926,outputSeed:0x27182818,inputBias:0xdeadbeef,outputBias:0xcafebabe}
  ];
  const sampleSeeds=[0x12345678,0xdeadbeef];
  const hiddenTargets=[
    0x67aa29ff,0x628acbfe,0xfe1940fd,0xc1ece67b,
    0x3e411777,0x37fff36f,0xbd72765f,0x8721e5bf
  ];
  const maxLowRankOrbitLowerBounds=[
    [2082189,2048076],
    [2064800,2074107]
  ];

  /** @type {Array<Object>} */
  const receipts=[];
  let totalDifferentialQueries=0;
  let totalDifferentialVerified=0;
  let totalGraphReported=0;
  let totalGraphUnique=0;

  for(let wrapperIndex=0;wrapperIndex<wrappers.length;wrapperIndex++){
    const wrapper=wrappers[wrapperIndex];
    const inputColumns=makeLinearTransform(wrapper.inputSeed);
    const outputColumns=makeLinearTransform(wrapper.outputSeed);
    const inputInverse=inverseOfColumns(inputColumns);
    assert.ok(inputInverse,'input affine wrapper must be invertible');
    assert.ok(inverseOfColumns(outputColumns),'output affine wrapper must be invertible');

    /** @param {number} input @returns {number} */
    const oracle=input=>{
      const hidden=(applyLinear(inputColumns,input)^wrapper.inputBias)>>>0;
      return (applyLinear(outputColumns,rank21Triangular(hidden,terms))^wrapper.outputBias)>>>0;
    };
    /** @param {bigint} input @returns {bigint} */
    const bigOracle=input=>BigInt(oracle(Number(input)));

    for(let sampleIndex=0;sampleIndex<sampleSeeds.length;sampleIndex++){
      const sampleSeed=sampleSeeds[sampleIndex];
      const learned=learnFlag(oracle,{
        bits:32,samplesPerStage:16,sampleSeed,maxQueries:1000000
      });
      const differentialStatus=learned.status;
      const trainingQueries=differentialStatus==='calibrated'?
        learned.trainingQueries:learned.queries;
      let verifiedTargets=0;
      let differentialNewQueries=0;
      /** @type {Array<Object>} */
      const targetReceipts=[];

      const graphCache=new Map();
      let graphReportedCalls=0;
      let graphTotalCalls=0;
      /** @param {bigint} input @returns {bigint} */
      const cachedBigOracle=input=>{
        const key=Number(input)>>>0;
        graphTotalCalls++;
        if(!graphCache.has(key))graphCache.set(key,BigInt(oracle(key)));
        return /** @type {bigint} */ (graphCache.get(key));
      };
      const graphSeed=(0x5e21+wrapperIndex*0x100+sampleIndex*0x20)>>>0;

      for(let targetIndex=0;targetIndex<hiddenTargets.length;targetIndex++){
        const secret=inputInverse((hiddenTargets[targetIndex]^wrapper.inputBias)>>>0);
        const target=oracle(secret);
        let differential=null;
        if(differentialStatus==='calibrated'){
          differential=learned.invert(target);
          assert.equal(differential.verified,oracle(differential.input)===target,
            'the learner verification bit must equal an independent oracle check');
          if(differential.verified){
            assert.equal(differential.input,secret);
            verifiedTargets++;
          }
          differentialNewQueries+=differential.newQueries;
        }

        const graph=invertByRandomAffineGraph(
          cachedBigOracle,BigInt(target),32,5,{seed:graphSeed,delta:1e-8}
        );
        assert.equal(graph.input,BigInt(secret));
        assert.equal(graph.verified,true);
        graphReportedCalls+=graph.queries;

        targetReceipts.push({
          targetIndex,
          secret:'0x'+secret.toString(16).padStart(8,'0'),
          target:'0x'+target.toString(16).padStart(8,'0'),
          differentialVerified:differential?.verified??false,
          differentialNewQueries:differential?.newQueries??0,
          graphQueries:graph.queries
        });
      }

      const differentialQueries=differentialStatus==='calibrated'?
        learned.queries():learned.queries;
      const graphUnique=graphCache.size;
      assert.equal(graphTotalCalls,graphReportedCalls);
      totalDifferentialQueries+=differentialQueries;
      totalDifferentialVerified+=verifiedTargets;
      totalGraphReported+=graphReportedCalls;
      totalGraphUnique+=graphUnique;
      receipts.push({
        wrapperIndex,
        sampleSeed:'0x'+sampleSeed.toString(16),
        differentialStatus,
        trainingQueries,
        differentialNewQueries,
        differentialQueries,
        verifiedTargets,
        graphReportedCalls,
        graphUnique,
        graphCacheSavings:graphReportedCalls-graphUnique,
        lowRankUniqueLowerBound:maxLowRankOrbitLowerBounds[wrapperIndex][sampleIndex],
        targetReceipts
      });
    }
  }

  process.stdout.write('OBFS_RANK21_DIFFERENTIAL_FLAG_COMPARISON '+JSON.stringify({
    source:'rank-21-displacement-degree-five-triangular-permutation',
    wrappers:wrappers.length,
    targetsPerBatch:hiddenTargets.length,
    sampleSeeds:sampleSeeds.map(seed=>'0x'+seed.toString(16)),
    learnerSamplesPerStage:16,
    nonlinearOutputRank:21,
    topDegree:5,
    totalDifferentialQueries,
    totalDifferentialVerified,
    totalGraphReported,
    totalGraphUnique,
    differentialToGraphUniqueRatio:totalDifferentialQueries/totalGraphUnique,
    receipts
  })+'\n');
});
