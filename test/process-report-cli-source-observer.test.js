'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runExperiment}=require('../sims/process-report-cli-source-observer');

test('external uncaught-report configuration observes transformed source coordinates',async()=>{
  const result=await runExperiment();
  const detail=JSON.stringify(result);
  assert.equal(result.native.status,1,detail);
  assert.equal(result.shortened.status,1,detail);
  assert.equal(result.native.message,'Error: 73',detail);
  assert.equal(result.shortened.message,'Error: 73',detail);
  assert.equal(result.native.line,1,detail);
  assert.equal(result.shortened.line,1,detail);
  assert.notEqual(result.native.column,result.shortened.column,detail);
  assert.equal(result.coordinatesEqual,false,detail);
});
