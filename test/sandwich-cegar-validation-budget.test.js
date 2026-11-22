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
    assert.ok(result.queryCount<=33,'budget '+budget);
  }
});

test('invalid budget values must fail closed',()=>{
  for(const value of [-1,129,3.5,NaN,Infinity,'8',null]){
    assert.throws(()=>invertLinearSandwich(x=>x,1,2,
      {validationTrials:/** @type {number} */(value)}),/validationTrials/);
  }
});
