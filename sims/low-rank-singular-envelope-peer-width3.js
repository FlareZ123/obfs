'use strict';

const assert = require('node:assert/strict');

/** @param {number[]} columns @param {number} x @returns {number} */
function apply(columns, x) {
  let value = 0;
  for (let i = 0; i < columns.length; i++) {
    if ((x >>> i) & 1) value ^= columns[i];
  }
  return value;
}

/** @param {number[]} columns @returns {number} */
function rank(columns) {
  const pivots = [0, 0, 0];
  let count = 0;
  for (const column of columns) {
    let value = column;
    for (let bit = 2; bit >= 0; bit--) {
      if (!(value & (1 << bit))) continue;
      if (pivots[bit]) value ^= pivots[bit];
      else {
        pivots[bit] = value;
        count++;
        break;
      }
    }
  }
  return count;
}

/**
 * Independent exhaustive singular-A quotient fiber verification.
 * A runs through ALL 512 three-bit linear maps. U and V are fixed,
 * full-rank two-planes; g runs through all 256 arbitrary tables.
 * This fixed-projection family is intentionally narrower than the
 * existing 168 * 7 * 7 * 256 independent invertible-A peer witness.
 *
 * @returns {object}
 */
function main() {
  const counts = {
    parameterRepresentations: 0,
    targetChecks: 0,
    unreachableTargets: 0,
    nonInjectiveRepresentations: 0,
    singularARepresentations: 0,
    singularInterpolants: 0,
    rankOneResiduals: 0,
    nullityA: [0, 0, 0, 0],
    envelopeNullity: [0, 0, 0, 0],
    nonemptyEnvelopes: 0,
    emptyEnvelopes: 0,
    maxEnvelopeSize: 0,
    maxNullityExponent: 0,
    maxNullityUpperBoundSlack: 0
  };
  const U = [1, 2];
  const corrections = [0, U[0], U[1], U[0] ^ U[1]];
  for (let a = 0; a < 8; a++) {
    for (let b = 0; b < 8; b++) {
      for (let d = 0; d < 8; d++) {
        const A = [a, b, d];
        const nullityA = 3 - rank(A);
        for (let tableEncoding = 0; tableEncoding < 256; tableEncoding++) {
          const table = [tableEncoding & 3, (tableEncoding >>> 2) & 3,
            (tableEncoding >>> 4) & 3, (tableEncoding >>> 6) & 3];
          const F = Array.from({length: 8}, (_, x) =>
            apply(A, x) ^ corrections[table[x & 3]]);
          const c = F[0];
          const M = [F[1] ^ c, F[2] ^ c, F[4] ^ c];
          const mapped = Array.from({length: 8}, (_, x) => apply(M, x));
          const residual = F.map((y, x) => y ^ c ^ mapped[x]);
          let w = 0;
          for (const value of residual) {
            if (value === 0) continue;
            if (w !== 0) assert.equal(value, w);
            w = value;
          }
          const spanRank = w === 0 ? 0 : 1;
          const combinedRank = rank(w === 0 ? M : [...M, w]);
          const nu = 3 + spanRank - combinedRank;
          assert.ok(nu >= 0 && nu <= 3);
          assert.ok(nu <= 2 + nullityA,
            'Singular core bound nu <= rank(U) + nullity(A) failed');
          const envelopeSize = 2 ** nu;
          let imageMask = 0;
          for (const y of F) imageMask |= 1 << y;
          if (imageMask !== 255) counts.nonInjectiveRepresentations++;
          if (nullityA) counts.singularARepresentations++;
          if (rank(M) < 3) counts.singularInterpolants++;
          if (spanRank) counts.rankOneResiduals++;
          counts.nullityA[nullityA]++;
          counts.envelopeNullity[nu]++;
          counts.maxNullityExponent = Math.max(counts.maxNullityExponent, nu);
          counts.maxNullityUpperBoundSlack = Math.max(
            counts.maxNullityUpperBoundSlack, 2 + nullityA - nu);
          for (let y = 0; y < 8; y++) {
            let candidates = 0;
            let actualPreimages = 0;
            let verifiedCandidates = 0;
            for (let x = 0; x < 8; x++) {
              if (F[x] === y) actualPreimages++;
              const residue = y ^ c ^ mapped[x];
              if (residue !== 0 && residue !== w) continue;
              candidates++;
              if (F[x] === y) verifiedCandidates++;
            }
            assert.equal(verifiedCandidates, actualPreimages);
            assert.ok(candidates === 0 || candidates === envelopeSize,
              'A consistent quotient fiber must have 2^nu inputs');
            if (candidates) counts.nonemptyEnvelopes++;
            else counts.emptyEnvelopes++;
            if (actualPreimages === 0) counts.unreachableTargets++;
            counts.maxEnvelopeSize = Math.max(counts.maxEnvelopeSize, candidates);
            counts.targetChecks++;
          }
          counts.parameterRepresentations++;
        }
      }
    }
  }
  assert.equal(counts.parameterRepresentations, 512 * 256);
  assert.equal(counts.targetChecks, 8 * 512 * 256);
  assert.equal(counts.nullityA.reduce((sum, n) => sum + n, 0),
    counts.parameterRepresentations);
  assert.ok(counts.singularARepresentations > 0);
  assert.ok(counts.rankOneResiduals > 0);
  assert.ok(counts.unreachableTargets > 0);
  assert.equal(counts.maxEnvelopeSize, 8);
  console.log(JSON.stringify({
    theorem: 'Every consistent quotient fiber has exactly 2^(n+dim W-rank[M W]) inputs',
    width: 3,
    family: 'All 512 linear A, fixed rank-two U/V planes, all 256 arbitrary g tables',
    ...counts
  }, null, 2));
  return counts;
}
if (require.main === module) main();
module.exports = {main};
