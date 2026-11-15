'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {studySourceObserverCoverage} = require('../sims/source-observer-coverage');

test('source observer global guard sacrifices unrelated native-ESM property coverage', async () => {
  for (const seed of ['observer-coverage-1','observer-coverage-2','observer-coverage-3']) {
    const result = await studySourceObserverCoverage(seed);
    assert.ok(result.nativeBehaviorPreserved);
    assert.ok(result.normal.totalProperties >= 2,
      'Normal graph must have at least two transformable own fields');
    assert.equal(result.observed.totalProperties, 0,
      'Current group-wide observer guard must decline all properties');
    assert.ok(result.isolated.totalProperties >= 1,
      'Hand-segregated independent function must keep one eligible field');
  }
});
