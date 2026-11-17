'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runEvidence}=require('../sims/polyvariant-app-heldout-seeds');

test('24 unseen compiler seeds all admit independent source-only full-app reconstruction',{timeout:120000},async()=>{
  const data=await runEvidence();
  assert.equal(data.compilerSeeds,24);
  assert.equal(data.variantHashes,24);
  assert.equal(data.recoveredFunctions,72);
  assert.equal(data.typedChecks,24*3*(8+512));
  assert.equal(data.statefulSessions,24*32);
  assert.ok(data.hostEvents>=data.statefulSessions);
  assert.ok(data.publishedBytes.min>data.recoveredBytes.max);
  assert.ok(data.attackerMs.min>=0);
  assert.ok(Number.isFinite(data.attackerMs.median));
  assert.ok(Number.isFinite(data.attackerMs.max));
});
