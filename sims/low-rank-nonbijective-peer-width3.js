'use strict';

const assert = require('node:assert/strict');

/** @param {number} value @returns {number} */
function parity(value) {
  value ^= value >>> 2;
  value ^= value >>> 1;
  return value & 1;
}

/** @param {number[]} columns @param {number} x @returns {number} */
function applyColumns(columns, x) {
  let value = 0;
  for (let i = 0; i < columns.length; i++) {
    if ((x >>> i) & 1) value ^= columns[i];
  }
  return value;
}

/** @param {number[]} columns @returns {number} */
function rank(columns) {
  const pivots = [0, 0, 0];
  let result = 0;
  for (const column of columns) {
    let word = column;
    for (let bit = 2; bit >= 0; bit--) {
      if (!(word & (1 << bit))) continue;
      if (pivots[bit]) word ^= pivots[bit];
      else {
        pivots[bit] = word;
        result++;
        break;
      }
    }
  }
  return result;
}

/** @returns {number[][]} */
function invertibleMatrices() {
  /** @type {number[][]} */
  const matrices = [];
  for (let a = 1; a < 8; a++) {
    for (let b = 1; b < 8; b++) {
      for (let c = 1; c < 8; c++) {
        const columns = [a, b, c];
        if (rank(columns) === 3) matrices.push(columns);
      }
    }
  }
  return matrices;
}

/** @returns {number[][]} */
function planes() {
  const seen = new Set();
  /** @type {number[][]} */
  const output = [];
  for (let a = 1; a < 8; a++) {
    for (let b = a + 1; b < 8; b++) {
      const support = [a, b, a ^ b].sort((x, y) => x - y);
      const id = support.join(',');
      if (seen.has(id)) continue;
      seen.add(id);
      output.push([a, b]);
    }
  }
  return output;
}

/**
 * Exhaust every width-three instance F(x)=b XOR A*x XOR U*g(V*x)
 * with invertible A and two-dimensional image and input projections.
 * All 256 arbitrary g tables are tested, with b=0 without loss of generality.
 * @returns {object}
 */
function main() {
  const As = invertibleMatrices();
  const Us = planes();
  const Vs = planes();
  assert.equal(As.length, 168);
  assert.equal(Us.length, 7);
  assert.equal(Vs.length, 7);
  const counts = {
    checked: 0,
    nonInjective: 0,
    singularInterpolant: 0,
    nonzeroResidual: 0,
    unreachableTargetChecks: 0,
    reachableTargetChecks: 0,
    affineCandidateChecks: 0,
    maxCandidates: 0,
    minNonzeroResidualFunctionalSupport: 8,
    witnessMax: /** @type {{A:number[],U:number[],V:number[],encoded:number,target:number,rankM:number,rankW:number}|null} */ (null),
    sampleLowerBoundChecks: 0,
    exactSamplingQueries: Math.ceil(4 * Math.log(3 / 0.01)),
    maxExactSpanFailureProbability: 0,
    maxExactSpanFailureQ16: 0,
    maxExactSpanFailureQ17: 0
  };

  for (const A of As) {
    const baseline = Array.from({ length: 8 }, (_, x) => applyColumns(A, x));
    for (const U of Us) {
      const displacements = [0, U[0], U[1], U[0] ^ U[1]];
      for (const V of Vs) {
        const labels = Array.from({ length: 8 }, (_, x) =>
          parity(V[0] & x) | (parity(V[1] & x) << 1));
        for (let encoded = 0; encoded < 256; encoded++) {
          const table = [encoded & 3, (encoded >>> 2) & 3,
            (encoded >>> 4) & 3, (encoded >>> 6) & 3];
          const F = baseline.map((value, x) =>
            value ^ displacements[table[labels[x]]]);
          const c = F[0];
          const M = [F[1] ^ c, F[2] ^ c, F[4] ^ c];
          const mapped = Array.from({ length: 8 }, (_, x) =>
            applyColumns(M, x));
          const residual = F.map((value, x) => value ^ c ^ mapped[x]);
          let Wmask = 1;
          for (const value of residual) {
            if (Wmask & (1 << value)) continue;
            const old = Wmask;
            for (let w = 0; w < 8; w++) {
              if (old & (1 << w)) Wmask |= 1 << (w ^ value);
            }
          }
          let countW = 0;
          for (let w = Wmask; w; w &= w - 1) countW++;
          const rankW = Math.log2(countW);
          assert.ok(Number.isInteger(rankW) && rankW <= 1);
          if (rankW > 0) counts.nonzeroResidual++;
          if (rank(M) < 3) counts.singularInterpolant++;
          let imageMask = 0;
          for (const y of F) imageMask |= 1 << y;
          if (imageMask !== 255) counts.nonInjective++;

          // Exact anti-concentration premise: every nonzero functional
          // on the residual image has probability at least 2^-2.
          for (let lambda = 1; lambda < 8; lambda++) {
            let support = 0;
            for (const r of residual) support += parity(lambda & r);
            if (support > 0) {
              assert.ok(support >= 2,
                'Nonzero residual functional below 2^-r mass');
              counts.sampleLowerBoundChecks++;
              counts.minNonzeroResidualFunctionalSupport =
                Math.min(counts.minNonzeroResidualFunctionalSupport, support);
            }
          }

          // Exact independent-uniform q-draw failure, evaluated by all
          // proper subspaces of W. For a plane, the three one-dimensional
          // subspaces intersect pairwise only in {0}.
          const frequencies = Array(8).fill(0);
          for (const value of residual) frequencies[value]++;
          for (const q of [16, 17, counts.exactSamplingQueries]) {
            let missProbability = 0;
            if (rankW === 1) {
              missProbability = (frequencies[0] / 8) ** q;
            } else if (rankW === 2) {
              let lineSum = 0;
              for (let w = 1; w < 8; w++) {
                if (!(Wmask & (1 << w))) continue;
                lineSum += ((frequencies[0] + frequencies[w]) / 8) ** q;
              }
              missProbability = lineSum - 2 * (frequencies[0] / 8) ** q;
            }
            assert.ok(missProbability >= -1e-12);
            if (q === 16) {
              counts.maxExactSpanFailureQ16 = Math.max(
                counts.maxExactSpanFailureQ16, missProbability);
            } else if (q === 17) {
              counts.maxExactSpanFailureQ17 = Math.max(
                counts.maxExactSpanFailureQ17, missProbability);
            } else {
              assert.ok(missProbability <= 0.01);
              counts.maxExactSpanFailureProbability = Math.max(
                counts.maxExactSpanFailureProbability, missProbability);
            }
          }

          for (let y = 0; y < 8; y++) {
            const reachable = (imageMask & (1 << y)) !== 0;
            let candidates = 0;
            let verifiedPreimages = 0;
            for (let x = 0; x < 8; x++) {
              if (!(Wmask & (1 << (y ^ c ^ mapped[x])))) continue;
              candidates++;
              if (F[x] === y) verifiedPreimages++;
            }
            assert.ok(candidates <= 4,
              'More than 2^r candidates in affine envelope');
            assert.equal(verifiedPreimages > 0, reachable,
              'False image-membership classification');
            counts.affineCandidateChecks += candidates;
            if (reachable) counts.reachableTargetChecks++;
            else counts.unreachableTargetChecks++;
            if (candidates > counts.maxCandidates) {
              counts.maxCandidates = candidates;
              counts.witnessMax = {
                A, U, V, encoded, target: y, rankM: rank(M), rankW
              };
            }
          }
          counts.checked++;
        }
      }
    }
  }
  assert.equal(counts.checked, As.length * Us.length * Vs.length * 256);
  assert.ok(counts.unreachableTargetChecks > 0);
  assert.ok(counts.singularInterpolant > 0);
  assert.ok(counts.nonzeroResidual > 0);
  assert.equal(counts.minNonzeroResidualFunctionalSupport, 2);
  assert.ok(counts.maxExactSpanFailureQ16 > 0.01);
  assert.ok(counts.maxExactSpanFailureQ17 < 0.01);
  console.log(JSON.stringify({
    theorem: 'Nonbijective GF(2)^3 affine plus rank-two projected correction',
    family: 'All GL(3,2), seven input and output planes, 256 nonlinear tables; b=0 WLOG',
    ...counts
  }, null, 2));
  return counts;
}

if (require.main === module) main();
module.exports = { main };
