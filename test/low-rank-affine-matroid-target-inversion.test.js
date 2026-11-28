'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {maximumPairedIndependentSet,invertBoundedResidual,
  generateLowRankPermutation,runTrials}=require('../sims/low-rank-affine-matroid-target-inversion');

/** @param {number[]} values @returns {number} */
function rank(values){
  const basis=Array(8).fill(0);let result=0;
  for(const original of values){
    let current=original;
    for(let bit=7;bit>=0;bit--){
      if(!((current>>>bit)&1))continue;
      if(basis[bit])current^=basis[bit];
      else{basis[bit]=current;result++;break;}
    }
  }
  return result;
}

/** @param {{input:number,output:number}[]} pairs @returns {number} */
function bruteMax(pairs){
  let best=0;
  for(let mask=0;mask<2**pairs.length;mask++){
    const chosen=pairs.filter((_,i)=>((mask>>>i)&1)!==0);
    if(chosen.length<=best)continue;
    if(rank(chosen.map(p=>p.input))===chosen.length&&
       rank(chosen.map(p=>p.output))===chosen.length)best=chosen.length;
  }
  return best;
}

/** @param {number[]} values @param {(permutation:number[])=>void} visit */
function permute(values,visit){
  /** @param {number} index */
  function go(index){
    if(index===values.length){visit(values);return;}
    for(let i=index;i<values.length;i++){
      [values[index],values[i]]=[values[i],values[index]];
      go(index+1);
      [values[index],values[i]]=[values[i],values[index]];
    }
  }
  go(0);
}

test('matroid-intersection algorithm agrees with exact brute force on subsets',()=>{
  const special=[
    [0,1,2,3,4,5,6,7],
    [0,4,5,6,1,2,3,7],
    [0,1,3,2,7,5,4,6]
  ];
  let subsets=0;
  for(const permutation of special){
    const ground=Array.from({length:7},(_,i)=>({input:i+1,output:permutation[i+1]}));
    for(let mask=0;mask<128;mask++){
      const subset=ground.filter((_,i)=>((mask>>>i)&1)!==0);
      const result=maximumPairedIndependentSet(subset,3);
      assert.equal(result.length,bruteMax(subset));
      assert.equal(rank(result.map(i=>subset[i].input)),result.length);
      assert.equal(rank(result.map(i=>subset[i].output)),result.length);
      subsets++;
    }
  }
  assert.equal(subsets,384);
});

test('every 3-bit permutation fixing 0 admits a full paired basis',()=>{
  let permutations=0;
  permute([1,2,3,4,5,6,7],p=>{
    const ground=p.map((output,i)=>({input:i+1,output}));
    const basis=maximumPairedIndependentSet(ground,3);
    assert.equal(basis.length,3);
    assert.equal(rank(basis.map(i=>ground[i].input)),3);
    assert.equal(rank(basis.map(i=>ground[i].output)),3);
    permutations++;
  });
  assert.equal(permutations,5040);
});

test('all 5,040 width-3 permutations invert all 40,320 targets with rank-at-most-three residual',()=>{
  let permutations=0,targets=0,maxAdaptive=0;
  permute([1,2,3,4,5,6,7],p=>{
    const outputs=[0,...p];
    /** @param {number} input @returns {number} */
    const f=input=>outputs[input];
    const samples=Array.from({length:8},(_,input)=>({input,output:outputs[input]}));
    for(let secret=0;secret<8;secret++){
      const result=invertBoundedResidual(f,outputs[secret],samples,3,3);
      assert.equal(result.input,secret);
      assert.equal(result.output,outputs[secret]);
      assert.ok(result.adaptiveCalls<=8);
      maxAdaptive=Math.max(maxAdaptive,result.adaptiveCalls);
      targets++;
    }
    permutations++;
  });
  assert.equal(permutations,5040);
  assert.equal(targets,40320);
  assert.ok(maxAdaptive>=4&&maxAdaptive<=8);
  console.log('EXHAUSTIVE_PERMUTATION_TARGETS '+JSON.stringify({permutations,targets,maxAdaptive}));
});

test('exhaustive width-3 rank-two fiber permutations invert every target',()=>{
  /** @type {number[][]} */
  const topPermutations=[];
  permute([0,1,2,3],permutation=>{topPermutations.push([...permutation]);});
  let functions=0,targets=0,maxAdaptive=0;
  for(const lower0 of topPermutations){
    for(const lower1 of topPermutations){
      /** @param {number} input @returns {number} */
      const f=input=>{
        const low=input&1,high=input>>>1;
        return ((low?lower1:lower0)[high]<<1)|low;
      };
      const base=f(0);
      const samples=Array.from({length:8},(_,x)=>({input:x,output:f(x)^base}));
      for(let secret=0;secret<8;secret++){
        const candidate=invertBoundedResidual(f,f(secret),samples,3,2);
        assert.equal(candidate.input,secret);
        assert.ok(candidate.adaptiveCalls<=4);
        maxAdaptive=Math.max(maxAdaptive,candidate.adaptiveCalls);
        targets++;
      }
      functions++;
    }
  }
  assert.equal(functions,576);
  assert.equal(targets,4608);
  assert.ok(maxAdaptive<=4);
  console.log('EXHAUSTIVE_RANK_TWO_WIDTH3 '+JSON.stringify({functions,targets,maxAdaptive}));
});

test('sparse 32-bit hidden rank-2 and rank-3 branches attain the exact query bound',()=>{
  for(const [r,permutation,secretHigh] of /** @type {[number,number[],number][]} */([
    [2,[1,2,3,0],0],
    [3,[0,1,2,4,5,6,7,3],7]
  ])){
    const lowCount=32-r,lowMask=2**lowCount-1;
    const trigger=0x127ab45&lowMask;
    /** @param {number} input @returns {number} */
    function f(input){
      const low=input&lowMask,high=(input>>>lowCount)&((1<<r)-1);
      return (low===trigger?(((permutation[high]<<lowCount)>>>0)|low):input)>>>0;
    }
    // The source is identity on *every* basis query; all the nonlinearity
    // is hidden in one of 2^(32-r) rare low-bit cosets.
    const samples=Array.from({length:32},(_,i)=>{
      const input=(2**i)>>>0;
      assert.equal(f(input),input);
      return {input,output:input};
    });
    const secret=(((secretHigh<<lowCount)>>>0)|trigger)>>>0;
    const result=invertBoundedResidual(f,f(secret),samples,32,r);
    assert.equal(result.input,secret);
    assert.equal(result.adaptiveCalls,2**r,'The 2^r bound is achieved');
  }
});

test('rank-r unknown-affine-perturbation inversion on 32-bit dense/sparse permutations',()=>{
  const configs=/** @type {Parameters<typeof runTrials>[0][]} */([
    {width:5,rank:2,seeds:12,sampleCount:48,shape:'dense',targetsPerCase:32},
    {width:7,rank:3,seeds:12,sampleCount:64,shape:'sparse',targetsPerCase:64},
    {width:32,rank:2,seeds:12,sampleCount:592,shape:'dense',targetsPerCase:16},
    {width:32,rank:3,seeds:12,sampleCount:592,shape:'sparse',targetsPerCase:16}
  ]);
  const results=configs.map(runTrials);
  for(const row of results){
    assert.equal(row.failures,0);
    assert.equal(row.minBasis,row.width);
    assert.ok(row.maxAdaptiveQueries<=2**row.rank);
  }
  assert.equal(results.reduce((sum,row)=>sum+row.targets,0),1536);
  console.log('MATROID_RANK_R_REPRODUCER '+JSON.stringify(results));
});

test('rank-aware n plus O(nr) paired-basis sampling bound at 32 bits',()=>{
  const cases=/** @type {Parameters<typeof runTrials>[0][]} */([
    {width:32,rank:2,seeds:12,sampleCount:166,shape:'dense',targetsPerCase:16,initialBasis:true},
    {width:32,rank:3,seeds:12,sampleCount:232,shape:'sparse',targetsPerCase:16,initialBasis:true}
  ]);
  const results=cases.map(runTrials);
  assert.ok(results.every(x=>x.failures===0));
  assert.ok(results.every(x=>x.maxAdaptiveQueries<=2**x.rank));
  assert.equal(results.reduce((sum,x)=>sum+x.targets,0),384);
  console.log('MATROID_RANK_AWARE_SAMPLES '+JSON.stringify(results));
});

test('explicit false-rank promise is rejected without returning a false preimage',()=>{
  const f=generateLowRankPermutation(7,3,0x196a05fd,'dense');
  const base=f(0);
  const samples=Array.from({length:128},(_,i)=>({input:i,output:(f(i)^base)>>>0}));
  // Some rank-3 generated functions happen to have lower actual residual
  // dimension relative to this paired interpolation. We check one fixed
  // empirically that requires more than one adaptive correction.
  let demanded=0;
  for(let x=0;x<128;x++){
    const result=invertBoundedResidual(f,f(x),samples,7,3);
    demanded=Math.max(demanded,result.adaptiveCalls);
  }
  assert.ok(demanded>=2);
  assert.throws(()=>{
    for(let x=0;x<128;x++)invertBoundedResidual(f,f(x),samples,7,0);
  },/rank bound/);
});
