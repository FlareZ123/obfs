'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runEvidence}=require('../sims/application-challenge-sno');

test('frozen six-ESM application through a single SNO entry preserves held-out output and remains owner-copyable',{
  timeout:120000
},async()=>{
  const result=await runEvidence();
  assert.equal(result.cases,85);
  assert.equal(result.offlineCloneMatches,true);
  assert.equal(result.manifestRejected,true);
  assert.equal(result.forgedExecution,true);
  assert.ok(result.changedFiles>=0);
  assert.ok(result.encodedLiterals>=0);
  assert.ok(result.renamedProperties>=0);
  assert.ok(result.renamedBindings>=0);
});
