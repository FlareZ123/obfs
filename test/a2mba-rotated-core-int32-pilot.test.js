'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  rotateLeft32,
  rotateRight32,
  makePackedRotatedAdd32,
  nativeRegion32,
  makeRotatedCore32,
  verifyRotatedCore32
} = require('../sims/a2mba-rotated-core-int32-pilot');

test('all 31 rotated coordinate regions preserve sampled Int32 behavior', () => {
  assert.deepEqual(verifyRotatedCore32(), {rotations: 31, randomCases: 620000});
});

test('rotation boundaries are exact inverses', () => {
  let state = 0x243f6a88 | 0;
  for (let rotation = 1; rotation <= 31; rotation++) {
    for (let index = 0; index < 10000; index++) {
      state = (Math.imul(state, 1664525) + 1013904223) | 0;
      assert.equal(rotateRight32(rotateLeft32(state, rotation), rotation), state);
    }
  }
});

test('packed rotated add is conjugate to native Int32 addition', () => {
  let state = 0x13198a2e | 0;
  for (let rotation = 1; rotation <= 31; rotation++) {
    const add = makePackedRotatedAdd32(rotation);
    for (let index = 0; index < 10000; index++) {
      state = (Math.imul(state, 1103515245) + 12345) | 0;
      const left = state;
      const right = (state ^ Math.imul(index, 0x45d9f3b)) | 0;
      const rotated = add(rotateLeft32(left, rotation), rotateLeft32(right, rotation));
      assert.equal(rotateRight32(rotated, rotation), (left + right) | 0);
    }
  }
});

test('edge values preserve the external coordinate-region fixture', () => {
  const edges = [0, 1, -1, 0x7fffffff, -0x80000000, 0x55555555, 0xaaaaaaaa | 0];
  for (let rotation = 1; rotation <= 31; rotation++) {
    const candidate = makeRotatedCore32(rotation);
    for (const value of edges) {
      assert.equal(candidate(value, ~value, value ^ 3, value >>> 1),
        nativeRegion32(value, ~value, value ^ 3, value >>> 1));
    }
  }
});
