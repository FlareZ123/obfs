'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runCoincidentRankAttack}=require('../sims/a2mba-rank-attacker-coincident');

test('frozen source-only attacker recovers same full-rank held-out source population',()=>{
  const result=runCoincidentRankAttack();
  assert.equal(result.cases,32);
  assert.equal(result.rank32,32);
  assert.equal(result.recoveries,32);
  assert.equal(result.testedCalls,32*12353);
  assert.match(result.sourceDigest,/^[0-9a-f]{64}$/u);
  assert.equal(result.attackerCommit,'2c478bb5e9418cc6ba0c59ef5d963a9cc3cb9614');
  assert.equal(result.seed,
    'heldout-after-2c478bb5:2026-11-19:agent38:a2mba-rotated-core:v1');
});
