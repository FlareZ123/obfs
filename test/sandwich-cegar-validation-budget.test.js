'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {invertLinearSandwich}=require('../sims/compatible-permutation-linear-sandwich-blackbox');
const {fixture}=require('../sims/sandwich-cegar-validation-sweep');

test('default CEGAR checks and explicit 128 checks have identical outcome',()=>{
  const item=fixture({
    name:'rivest-degree-3',
    make:require('../sims/compatible-permutation-linear-sandwich-blackbox')
      .makeRivestPermutation.bind(null,3)
  },0);
  const baseline=invertLinearSandwich(item.oracle,item.target,item.attackSeed);
  const explicit=invertLinearSandwich(item.oracle,item.target,item.attackSeed,
    {validationTrials:128});
  assert.deepEqual(explicit,baseline);
  assert.equal(explicit.value,item.secret);
});

test('finite configurable validation budgets recover affine permutations',()=>{
  const secret=0x9e3779b9;
  const target=secret;
  for(const budget of [0,4,8,16,32,64,128]){
    const result=invertLinearSandwich(x=>x>>>0,target,0x10203040,{validationTrials:budget});
    assert.equal(result.value,secret,'budget '+budget);
    assert.ok(result.queryCount>0,'budget '+budget);
  }
});

test('invalid budget values must fail closed',()=>{
  for(const value of [-1,129,3.5,NaN,Infinity,'8']){
    assert.throws(()=>invertLinearSandwich(x=>x,1,2,
      {validationTrials:/** @type {number} */(value)}),/validationTrials/);
  }
});


test('target-guided inversion can still recover a two-point sparse swap',()=>{
  // This compatible 32-bit permutation swaps only the two inputs with one
  // selected 31-bit prefix. A target-directed inversion may need much less
  // information than a global affine certificate.
  const trigger=0x21503a7b;
  /** @param {number} input @returns {number} */
  const oracle=input=>(
    (input&0x7fffffff)===trigger?input^0x80000000:input
  )>>>0;
  const target=oracle(trigger);
  assert.notEqual(target,trigger);
  assert.equal(oracle(target),trigger);
  for(const budget of [0,8,128]) {
    const result=invertLinearSandwich(oracle,target,0x510e527f,
      {validationTrials:budget});
    assert.equal(result.value,trigger,'budget '+budget);
    assert.equal(oracle(result.value),target);
  }
});

test('a real nonlinear target rejects an under-validated affine mask',()=>{
  const {makeTriangularCompatiblePermutation}=
    require('../sims/compatible-permutation-linear-sandwich-blackbox');
  const sample=fixture({
    name:'nonlinear-triangular',make:makeTriangularCompatiblePermutation
  },6);
  assert.throws(()=>invertLinearSandwich(sample.oracle,sample.target,sample.attackSeed,
    {validationTrials:0}),/sandwich inversion failed final equality/);
  assert.equal(
    invertLinearSandwich(sample.oracle,sample.target,sample.attackSeed,
      {validationTrials:128}).value,sample.secret);
});


test('default defect samples match explicit 32 and reject invalid counts',()=>{
  const oracle=x=>x>>>0;
  const target=0x4ea0376d;
  const implicit=invertLinearSandwich(oracle,target,0x40aabb11,
    {validationTrials:8});
  const explicit=invertLinearSandwich(oracle,target,0x40aabb11,
    {validationTrials:8,defectSamples:32});
  assert.deepEqual(implicit,explicit);
  for(const count of [0,-1,33,2.5,NaN,Infinity,'8']){
    assert.throws(()=>invertLinearSandwich(oracle,target,0x40aabb11,
      {validationTrials:8,defectSamples:/** @type {number} */(count)}),
    /defectSamples/);
  }
});
