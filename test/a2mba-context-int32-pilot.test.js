'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  contextTrap32,
  oddInverse32,
  contextPlusEnvelope32,
  verifyContextTrap32
} = require('../sims/a2mba-context-int32-pilot');

test('all pinned Context Trap parameter families preserve sampled Int32 values', () => {
  assert.deepEqual(verifyContextTrap32(), {parameterCases: 3012, randomCases: 200000});
});

test('odd inverse circuit is exact modulo 2^32', () => {
  let state = 0x243f6a88 | 0;
  for (let index = 0; index < 100000; index++) {
    state = (Math.imul(state, 1103515245) + 12345) | 0;
    const key = state | 1;
    assert.equal(Math.imul(key, oddInverse32(key)), 1);
  }
});

test('six Context Trap forms and the nonlinear envelope preserve edge values', () => {
  const values = [0, 1, -1, 0x7fffffff, -0x80000000, 0x55555555, 0xaaaaaaaa | 0];
  for (const value of values) {
    for (let variant = 0; variant < 6; variant++) {
      assert.equal(contextTrap32(value, 8, 0xa5, variant), value | 0);
    }
    assert.equal(contextPlusEnvelope32(value), value | 0);
  }
});
