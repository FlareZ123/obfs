'use strict';

const assert = require('node:assert/strict');
const {learnQuadraticOracle, evaluateQuadraticModel} =
  require('./quadratic-oracle-functional-clone');
const {hidden32, hiddenFullRank32} = require('./quadratic-radical-peer-check');
const {invertQuadraticPermutation} = require('./quadratic-radical-target-inversion');

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

/** @param {number[]} columns @param {number} bits @returns {number} */
function rank(columns, bits) {
  const pivots = Array(bits).fill(0);
  let count = 0;
  for (const original of columns) {
    let v = original >>> 0;
    for (let i = bits - 1; i >= 0 && v; i--) {
      if (!((v >>> i) & 1)) continue;
      if (pivots[i]) v = (v ^ pivots[i]) >>> 0;
      else {
        pivots[i] = v;
        count++;
        break;
      }
    }
  }
  return count;
}

/** @param {number[]} a @returns {Generator<number[]>} */
function* permutations(a) {
  if (!a.length) {
    yield [];
    return;
  }
  for (let i = 0; i < a.length; i++) {
    for (const rest of permutations([...a.slice(0, i), ...a.slice(i + 1)])) {
      yield [a[i], ...rest];
    }
  }
}

/** @param {number} bits @returns {number} */
function queries(bits) {
  return 1 + bits + bits * (bits - 1) / 2;
}

function main() {
  const summary = {
    width3PermutationsCloned: 0, width3OutputsVerified: 0,
    width3QueriesEach: 7, fullRank32Instances: 0,
    fullRank32HeldoutOutputs: 0, fullRank32PublicResidualRank: 32,
    rank24Instances: 0, rank24HeldoutOutputs: 0,
    fullRank32OfflineInversions: 0, rank24OfflineInversions: 0,
    width32TrainingQueriesEach: 529, nonquadraticSpoofTrainingQueries: 37,
    nonquadraticSpoofHiddenMismatches: 0
  };

  for (const permutation of permutations([0,1,2,3,4,5,6,7])) {
    let calls = 0;
    const model = learnQuadraticOracle(x => {
      calls++;
      return permutation[x];
    }, 3);
    assert.equal(calls, 7);
    assert.equal(model.queryCount, 7);
    const saved = JSON.parse(JSON.stringify(model));
    for (let x = 0; x < 8; x++) {
      assert.equal(evaluateQuadraticModel(saved, x), permutation[x]);
      summary.width3OutputsVerified++;
    }
    summary.width3PermutationsCloned++;
  }

  const next = rng(0xe29831d6);
  for (const [kind, generator, expectedRank] of [
    /** @type {const} */(['rank32',hiddenFullRank32,32]),
    /** @type {const} */(['rank24',hidden32,24])
  ]) {
    for (let instance = 0; instance < 8; instance++) {
      const oracle = generator(next());
      let serverAvailable = true;
      let serverCalls = 0;
      const model = learnQuadraticOracle(x => {
        if (!serverAvailable) throw new Error('A reconstructed client accessed the disabled server');
        serverCalls++;
        return oracle(x);
      }, 32);
      assert.equal(serverCalls, queries(32));
      assert.equal(model.queryCount, 529);
      const published = JSON.parse(JSON.stringify(model));
      const outputRank = rank(
        published.quadratic.flatMap((row, i) => row.slice(i + 1)), 32);
      assert.equal(outputRank, expectedRank);
      serverAvailable = false;
      for (let k = 0; k < 1024; k++) {
        const x = next();
        assert.equal(evaluateQuadraticModel(published, x), oracle(x));
        if (kind === 'rank32') summary.fullRank32HeldoutOutputs++;
        else summary.rank24HeldoutOutputs++;
        if (k < 8) {
          // The inversion attack now queries only the reconstructed
          // local model. Live server access remains disabled after training.
          const inverted = invertQuadraticPermutation(
            candidate => evaluateQuadraticModel(published, candidate), oracle(x),
            {bits: 32, maxCodimension: kind === 'rank32' ? 9 : 8, maxQueries: 1100});
          assert.equal(inverted.preimage, x);
          if (kind === 'rank32') summary.fullRank32OfflineInversions++;
          else summary.rank24OfflineInversions++;
        }
      }
      assert.equal(serverCalls, 529);
      if (kind === 'rank32') summary.fullRank32Instances++;
      else summary.rank24Instances++;
    }
  }

  // The sparse training transcript alone is not a proof of quadraticity.
  // Swapping two weight-three inputs yields a nonquadratic permutation
  // with the same 37 training replies as the identity permutation.
  const base = learnQuadraticOracle(x => x, 8);
  const changed = learnQuadraticOracle(x => x === 7 ? 11 : x === 11 ? 7 : x, 8);
  assert.equal(base.queryCount, 37);
  assert.deepEqual(changed, base);
  for (let x = 0; x < 256; x++) {
    const truth = x === 7 ? 11 : x === 11 ? 7 : x;
    if (evaluateQuadraticModel(changed, x) !== truth) {
      summary.nonquadraticSpoofHiddenMismatches++;
    }
  }
  assert.equal(summary.nonquadraticSpoofHiddenMismatches, 2);
  assert.equal(summary.width3PermutationsCloned, 40320);
  assert.equal(summary.width3OutputsVerified, 322560);
  assert.equal(summary.fullRank32HeldoutOutputs, 8192);
  assert.equal(summary.rank24HeldoutOutputs, 8192);
  assert.equal(summary.fullRank32OfflineInversions, 64);
  assert.equal(summary.rank24OfflineInversions, 64);
  process.stdout.write(JSON.stringify(summary) + '\n');
}

if (require.main === module) main();
module.exports = {main};
