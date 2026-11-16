'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runEvidence}=require('../sims/polyvariant-app-sno');

test('SNO executes a genuinely transformed three-module ESM app through one CJS entry; local owner still clones and bypasses manifest',{
  timeout:120000
},async()=>{
  const evidence=await runEvidence();
  assert.equal(evidence.cases,96);
  assert.equal(evidence.changedFiles,1);
  assert.equal(evidence.selectedFunctions,3);
  assert.equal(evidence.selectedPaths,6);
  assert.ok(evidence.emittedBytes>evidence.originalBytes);
  assert.equal(evidence.offlineClone,true);
  assert.equal(evidence.manifestForged,true);
  assert.equal(evidence.directEsmClone,true);
});
