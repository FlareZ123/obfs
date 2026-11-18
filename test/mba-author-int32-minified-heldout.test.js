'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ATTACKER_COMMIT,
  SEED,
  runHeldoutRecovery
} = require('../sims/mba-author-int32-minified-heldout');

test('post-freeze minified Int32 corpus is exactly recovered at budget-surviving depths', () => {
  assert.equal(ATTACKER_COMMIT, 'dbe09e3ab6883c0939b2ec89f82841a81c98771d');
  assert.match(SEED, /^heldout-after-dbe09e3a:/);
  const result = runHeldoutRecovery();
  assert.equal(result.cases, 32);
  assert.equal(result.exactParameterRecoveries, 32);
  assert.equal(result.exactPreimages, 32);
});
