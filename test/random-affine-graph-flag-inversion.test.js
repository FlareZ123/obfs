'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeSeededRandomCoordinates,makeRandomTriangularOracle,
  invertByRandomAffineGraph,randomWord,binomialSum}=require('../sims/random-affine-graph-flag-inversion');

test('random affine-graph inversion recovers targets in two-sided triangular permutations',()=>{
  const cases=[
    ...[1,2,3,4,5].map(seed=>({width:32,degree:4,seed})),
    ...[1,2,3,4,5].map(seed=>({width:32,degree:5,seed})),
    ...[1,2,3].map(seed=>({width:32,degree:6,seed})),
    ...[1,2].map(seed=>({width:64,degree:4,seed}))
  ];
  for(const {width,degree,seed} of cases){
    const {oracle}=makeRandomTriangularOracle(width,degree,seed);
    const secret=randomWord(width,makeSeededRandomCoordinates(seed+100));
    const target=oracle(secret);
    const result=invertByRandomAffineGraph(oracle,target,width,degree,{seed:seed+200,delta:1e-8});
    assert.equal(result.success,true,JSON.stringify({width,degree,seed,reason:result.reason,failedDimension:result.failedDimension}));
    assert.equal(result.input,secret);
    assert.equal(result.verified,true);
    assert.ok(result.queries<binomialSum(width,degree));
  }
});

test('the graph method refuses a residual permutation with no nonconstant affine output component',()=>{
  const table=[0,1,2,4,3,6,7,5];
  /** @type {(input:bigint)=>bigint} */
  const oracle=input=>(input&~7n)|BigInt(table[Number(input&7n)]);
  const secret=0x9a123457n;
  const target=oracle(secret);
  const result=invertByRandomAffineGraph(oracle,target,32,2,{seed:77,delta:1e-8});
  assert.equal(result.success,false);
  assert.equal(result.reason,'no-nonconstant-relation');
  assert.equal(result.failedDimension,3);
});
