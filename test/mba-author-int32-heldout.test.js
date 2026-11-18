'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  runHeldoutRecovery,
  optimizedTransform32
} = require('../sims/mba-author-int32-heldout');

test('post-freeze Int32 author-style inverse recovers every held-out chain', () => {
  const result = runHeldoutRecovery();
  assert.equal(result.cases, 32);
  assert.equal(result.exactRecoveries, 32);
  assert.equal(result.records.length, 32);
  assert.ok(result.records.every(record => record.exact === true));
});

test('budget-candidate depths preserve the protected Int32 equality predicate', () => {
  for (const rounds of [1, 2, 4]) {
    const target = optimizedTransform32(47, rounds);
    for (let code = 0; code < 128; code++) {
      assert.equal(optimizedTransform32(code, rounds) === target, code === 47);
    }
  }
});
