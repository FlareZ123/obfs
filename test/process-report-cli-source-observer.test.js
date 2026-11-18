'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runExperiment}=require('../sims/process-report-cli-source-observer');

test('external uncaught-report configuration observes transformed source coordinates',async()=>{
  const result=await runExperiment();
  assert.ok(result.properties+result.bindings>0,JSON.stringify(result));
  assert.equal(result.native.status,1);
  assert.equal(result.emitted.status,1);
  assert.equal(result.native.message,'Error: 73');
  assert.equal(result.emitted.message,'Error: 73');
  assert.equal(result.framesEqual,false,JSON.stringify(result));
});
