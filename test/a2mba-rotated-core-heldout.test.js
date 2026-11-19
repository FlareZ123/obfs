'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {ATTACKER_COMMIT, SEED, runHeldoutRecovery} =
  require('../sims/a2mba-rotated-core-heldout');

test('frozen rotated-core source normalizer recovers all post-freeze heldout cases', () => {
  const result = runHeldoutRecovery();
  assert.equal(result.attackerCommit, '2c478bb5e9418cc6ba0c59ef5d963a9cc3cb9614');
  assert.equal(result.seed, SEED);
  assert.deepEqual(result, {
    cases: 32,
    exactRecoveries: 32,
    attackerCommit: ATTACKER_COMMIT,
    seed: SEED
  });
});
