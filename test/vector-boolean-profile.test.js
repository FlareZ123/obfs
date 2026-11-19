'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  profileVectorBooleanFunction,
  vectorAnfCoefficients,
} = require('../sims/vector-boolean-profile.js');

test('vector Boolean profiler recognizes affine identity', () => {
  const outputs = Array.from({length: 8}, (_, input) => input);
  const profile = profileVectorBooleanFunction(outputs);
  assert.equal(profile.inputBits, 3);
  assert.equal(profile.algebraicDegree, 1);
  assert.equal(profile.residualRank, 0);
  assert.deepEqual(profile.rankByMaxDegree, [3, 0, 0, 0]);
});

test('vector Boolean profiler captures carry hierarchy of multiply-by-three', () => {
  const width = 8;
  const mask = (1 << width) - 1;
  const outputs = Array.from(
    {length: 1 << width},
    (_, input) => (3 * input) & mask,
  );
  const profile = profileVectorBooleanFunction(outputs);
  assert.equal(profile.inputBits, width);
  assert.equal(profile.algebraicDegree, 7);
  assert.equal(profile.residualRank, 6);
  assert.deepEqual(profile.rankByMaxDegree, [8, 6, 5, 4, 3, 2, 1, 0, 0]);
});

test('vector ANF transform round-trip fixture exposes the quadratic coefficient', () => {
  const outputs = Array.from({length: 8}, (_, input) => {
    const x0 = input & 1;
    const x1 = (input >>> 1) & 1;
    return input ^ ((x0 & x1) << 2);
  });
  const coefficients = vectorAnfCoefficients(outputs);
  assert.equal(coefficients[3], 4);
  const profile = profileVectorBooleanFunction(outputs);
  assert.equal(profile.algebraicDegree, 2);
  assert.equal(profile.residualRank, 1);
  assert.deepEqual(profile.rankByMaxDegree, [3, 1, 0, 0]);
});
