'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {classifyShortResetOpportunity,runGroundTruthSweep}=
  require('../sims/sco-sync-independent-ground-truth');

test('ground-truth evaluator separates physical from observational reset opportunities',()=>{
  const permutation={next:[[1,0],[0,1]],output:[[0,0],[0,0]]};
  assert.deepEqual(classifyShortResetOpportunity(permutation),{
    physical:false,globalObservable:true,initialObservable:true
  });
  const distinguished={next:[[1,0],[0,1]],output:[[0,0],[1,1]]};
  assert.deepEqual(classifyShortResetOpportunity(distinguished),{
    physical:false,globalObservable:false,initialObservable:false
  });
  const resetting={next:[[0,0],[0,0]],output:[[0,0],[1,1]]};
  assert.deepEqual(classifyShortResetOpportunity(resetting),{
    physical:true,globalObservable:true,initialObservable:true
  });
});

test('all 1200 SHA fixture machines have pinned short-word opportunity denominators',()=>{
  const result=runGroundTruthSweep(100);
  assert.equal(result.count,100);
  assert.deepEqual(result.records,[
    {states:4,models:400,physical:249,globalObservable:263,initialObservable:284},
    {states:8,models:400,physical:52,globalObservable:56,initialObservable:103},
    {states:12,models:400,physical:2,globalObservable:2,initialObservable:23}
  ]);
});

test('bounded fixture sweep validates count before model generation',()=>{
  assert.throws(()=>runGroundTruthSweep(0),RangeError);
  assert.throws(()=>runGroundTruthSweep(251),RangeError);
  assert.deepEqual(runGroundTruthSweep(1).records.map(record=>record.models),[4,4,4]);
});
