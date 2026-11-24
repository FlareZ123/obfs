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
  // The first two seeds match the graph/low-rank shared-cache comparison.
  const sampleSeeds=[
    0x12345678,0xdeadbeef,0x5eed1234,0x0badc0de,
    0x13579bdf,0x2468ace0,0xabcdef01,0x31415926,
    0x27182818,0x87654321,0x0f1e2d3c,0xc001d00d,
    0xfaceb00c,0x1badb002,0xdecafbad,0x10293847
  ];
  const sampleSizes=[16,24,32];
  const hiddenTargets=[
    0x67aa29ff,0x628acbfe,0xfe1940fd,0xc1ece67b,
    0x3e411777,0x37fff36f,0xbd72765f,0x8721e5bf
  ];
  /** @type {Record<number,{verified:number,queries:number,fullBatches:number}>} */
  const expected={
    16:{verified:244,queries:298574,fullBatches:26},
    24:{verified:253,queries:441936,fullBatches:31},
    32:{verified:256,queries:585296,fullBatches:32}
  };
  /** @type {Map<number,{verified:number,queries:number,fullBatches:number,unsupported:number,batches:number}>} */
  const totals=new Map();
  for(const samples of sampleSizes){
    totals.set(samples,{verified:0,queries:0,fullBatches:0,unsupported:0,batches:0});
  }
  /** @type {Array<Object>} */
  const differentialReceipts=[];
  /** @type {Array<Object>} */
  const graphReceipts=[];
  let matched32DifferentialQueries=0;
  let totalGraphReported=0;
  let totalGraphUnique=0;
  const expectedGraphReported=[[219162,219121],[219225,219291]];
  const expectedGraphUnique=[[130032,129829],[129196,129123]];
  const lowRankUniqueLowerBounds=[[2082189,2048076],[2064800,2074107]];

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

    for(let sampleIndex=0;sampleIndex<sampleSeeds.length;sampleIndex++){
      const sampleSeed=sampleSeeds[sampleIndex];
      for(const samplesPerStage of sampleSizes){
        const learned=learnFlag(oracle,{
          bits:32,samplesPerStage,sampleSeed,maxQueries:1000000
        });
        const calibrated=learned.status==='calibrated';
        const receipt=totals.get(samplesPerStage);
        assert.ok(receipt);
        receipt.batches++;
        const trainingQueries=calibrated?learned.trainingQueries:learned.queries;
        let verifiedTargets=0;
        /** @type {number[]} */
        const failedTargets=[];
        if(calibrated){
          for(let targetIndex=0;targetIndex<hiddenTargets.length;targetIndex++){
            const secret=inputInverse((hiddenTargets[targetIndex]^wrapper.inputBias)>>>0);
            const target=oracle(secret);
            const inverse=learned.invert(target);
            assert.equal(inverse.verified,oracle(inverse.input)===target,
              'the learner verification bit must equal an independent oracle check');
            if(inverse.verified){
              assert.equal(inverse.input,secret);
              verifiedTargets++;
            }else failedTargets.push(targetIndex);
          }
        }else{
          for(let targetIndex=0;targetIndex<hiddenTargets.length;targetIndex++)
            failedTargets.push(targetIndex);
          receipt.unsupported++;
        }
        const queries=calibrated?learned.queries():learned.queries;
        receipt.verified+=verifiedTargets;
        receipt.queries+=queries;
        if(verifiedTargets===hiddenTargets.length)receipt.fullBatches++;
        if(samplesPerStage===32&&sampleIndex<2)
          matched32DifferentialQueries+=queries;
        differentialReceipts.push({
          wrapperIndex,
          sampleSeed:'0x'+sampleSeed.toString(16),
          samplesPerStage,
          status:learned.status,
          trainingQueries,
          totalQueries:queries,
          verifiedTargets,
          failedTargets
        });
      }

      // Reproduce the exact shared-cache graph baseline for the two original
      // completion seeds; this is a separate, matched eight-target batch.
      if(sampleIndex<2){
        const cache=new Map();
        let totalCalls=0,reportedCalls=0;
        /** @param {bigint} input @returns {bigint} */
        const cachedBigOracle=input=>{
          const key=Number(input)>>>0;
          totalCalls++;
          if(!cache.has(key))cache.set(key,BigInt(oracle(key)));
          return /** @type {bigint} */ (cache.get(key));
        };
        const graphSeed=(0x5e21+wrapperIndex*0x100+sampleIndex*0x20)>>>0;
        for(let targetIndex=0;targetIndex<hiddenTargets.length;targetIndex++){
          const secret=inputInverse((hiddenTargets[targetIndex]^wrapper.inputBias)>>>0);
          const target=oracle(secret);
          const graph=invertByRandomAffineGraph(
            cachedBigOracle,BigInt(target),32,5,{seed:graphSeed,delta:1e-8}
          );
          assert.equal(graph.input,BigInt(secret));
          assert.equal(graph.verified,true);
          reportedCalls+=graph.queries;
        }
        const uniqueCalls=cache.size;
        assert.equal(totalCalls,reportedCalls);
        assert.equal(reportedCalls,expectedGraphReported[wrapperIndex][sampleIndex]);
        assert.equal(uniqueCalls,expectedGraphUnique[wrapperIndex][sampleIndex]);
        totalGraphReported+=reportedCalls;
        totalGraphUnique+=uniqueCalls;
        graphReceipts.push({
          wrapperIndex,
          sampleSeed:'0x'+sampleSeed.toString(16),
          reportedCalls,
          uniqueCalls,
          lowRankUniqueLowerBound:lowRankUniqueLowerBounds[wrapperIndex][sampleIndex]
        });
      }
    }
  }

  for(const samplesPerStage of sampleSizes){
    const actual=totals.get(samplesPerStage);
    assert.ok(actual);
    assert.equal(actual.batches,wrappers.length*sampleSeeds.length);
    assert.equal(actual.verified,expected[samplesPerStage].verified);
    assert.equal(actual.queries,expected[samplesPerStage].queries);
    assert.equal(actual.fullBatches,expected[samplesPerStage].fullBatches);
    assert.equal(actual.unsupported,0);
  }
  assert.equal(totalGraphReported,876799);
  assert.equal(totalGraphUnique,518180);
  assert.equal(matched32DifferentialQueries,73162);

  process.stdout.write('OBFS_RANK21_DIFFERENTIAL_FLAG_COMPARISON '+JSON.stringify({
    source:'rank-21-displacement-degree-five-triangular-permutation',
    wrappers:wrappers.length,
    targetsPerBatch:hiddenTargets.length,
    sampleSeeds:sampleSeeds.map(seed=>'0x'+seed.toString(16)),
    learnerSampleSizes:sampleSizes,
    learnerSummaries:Object.fromEntries([...totals.entries()].map(([samples,value])=>[samples,value])),
    matched32SampleDifferentialQueries:matched32DifferentialQueries,
    matchedGraphReportedCalls:totalGraphReported,
    matchedGraphUniqueCalls:totalGraphUnique,
    matchedDifferentialToGraphUniqueRatio:matched32DifferentialQueries/totalGraphUnique,
    graphReceipts,
    differentialReceipts
  })+'\n');
});
