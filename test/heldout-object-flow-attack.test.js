'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runHeldout}=require('../sims/heldout-object-flow-attack');

test('held-out ESM object flow: covered private keys, refusals and source-only attack',async()=>{
  const result=await runHeldout(3);
  assert.equal(result.graphs,30);
  assert.equal(result.positiveGraphs,9);
  assert.equal(result.refusedGraphs,21);
  assert.equal(result.candidatePrivateFields,60);
  assert.equal(result.renamedPrivateFields,18);
  assert.ok(result.recoveredLabels>=18);
  assert.equal(result.apiConfigurations,2);
  assert.equal(result.observations,60);
  assert.equal(result.outputMatches,60);
  assert.equal(result.normalizedMatches,60);
  assert.equal(Object.keys(result.refusalKinds).length,7);
});
