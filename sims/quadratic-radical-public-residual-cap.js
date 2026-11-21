'use strict';

const assert = require('node:assert/strict');
const {invertQuadraticPermutation} = require('./quadratic-radical-target-inversion');
const {invertPublicResidual32} = require('./public-affine-residual-target-inverter32');
const {hidden32} = require('./quadratic-radical-peer-check');

/** @param {number} seed @returns {()=>number} */
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function main() {
  const next = rng(0x3497f751);
  const limit = 1100;
  const report = {
    width: 32, knownQuadraticPromise: true, outputResidualRank: 24,
    inputRadicalCodimension: 8, instances: 6, targetsPerInstance: 4,
    cap: limit, radicalExact: 0, radicalTotalQueries: 0,
    radicalMaximumQueries: 0, priorExact: 0, priorCapped: 0,
    priorTotalObservedQueries: 0, priorMaxObservedQueries: 0
  };
  for (let instance = 0; instance < 6; instance++) {
    const oracle = hidden32(next());
    for (let sample = 0; sample < 4; sample++) {
      const input = next();
      const target = oracle(input);
      const priorSeen = new Set();
      const a = invertQuadraticPermutation(oracle, target, {bits: 32, maxCodimension: 8, maxQueries: limit});
      assert.equal(a.preimage, input);
      assert.equal(a.codimension, 8);
      report.radicalExact++;
      report.radicalTotalQueries += a.queryCount;
      report.radicalMaximumQueries = Math.max(report.radicalMaximumQueries, a.queryCount);
      try {
        const b = invertPublicResidual32(x => {
          priorSeen.add(x >>> 0);
          return oracle(x);
        }, target, {seed: next(), maxQueries: limit, maxSubspaceDimension: 25});
        assert.equal(b.value, input);
        assert.equal(b.queries, priorSeen.size);
        report.priorExact++;
      } catch (error) {
        if (!(error instanceof Error) || !/query cap/.test(error.message)) throw error;
        assert.equal(priorSeen.size, limit);
        report.priorCapped++;
      }
      report.priorTotalObservedQueries += priorSeen.size;
      report.priorMaxObservedQueries = Math.max(report.priorMaxObservedQueries, priorSeen.size);
    }
  }
  assert.equal(report.radicalExact, 24);
  assert.equal(report.priorExact + report.priorCapped, 24);
  assert.ok(report.radicalMaximumQueries < limit);
  process.stdout.write(JSON.stringify(report) + '\n');
}

if (require.main === module) main();
module.exports = {main};
