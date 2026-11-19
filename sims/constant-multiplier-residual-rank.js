'use strict';

/** @param {number} value @returns {number} */
function trailingZeroes(value) {
  let count = 0;
  let x = value;
  while ((x & 1) === 0) {
    count += 1;
    x >>>= 1;
  }
  return count;
}

/**
 * Exact public affine-residual rank for x -> a*x mod 2^width, with odd a.
 * @param {number} width
 * @param {number} multiplier
 * @returns {number}
 */
function predictedResidualRank(width, multiplier) {
  const modulus = 2 ** width;
  const a = multiplier % modulus;
  if ((a & 1) === 0) throw new TypeError('multiplier must be odd');
  if (a === 1) return 0;
  const t = trailingZeroes(a - 1);
  return width - t - 1;
}

/** @param {number[]} vectors @param {number} width @returns {number} */
function rank(vectors, width) {
  const pivots = Array(width).fill(0);
  let result = 0;
  for (const raw of vectors) {
    let value = raw;
    for (let bit = width - 1; bit >= 0 && value !== 0; bit -= 1) {
      if (((value >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) value ^= pivots[bit];
      else {
        pivots[bit] = value;
        result += 1;
        break;
      }
    }
  }
  return result;
}

/**
 * Exhaustive zero-based second-difference rank.
 * @param {number} width
 * @param {number} multiplier
 * @returns {number}
 */
function exhaustiveResidualRank(width, multiplier) {
  const size = 2 ** width;
  const mask = size - 1;
  /** @param {number} input @returns {number} */
  const map = (input) => (multiplier * input) & mask;
  const differences = [];
  for (let a = 0; a < size; a += 1) {
    for (let b = 0; b < size; b += 1) {
      differences.push(map(a) ^ map(b) ^ map(a ^ b));
    }
  }
  return rank(differences, width);
}

function main() {
  const rows = [];
  let multipliers = 0;
  for (let width = 2; width <= 8; width += 1) {
    let checked = 0;
    for (let multiplier = 1; multiplier < 2 ** width; multiplier += 2) {
      const actual = exhaustiveResidualRank(width, multiplier);
      const predicted = predictedResidualRank(width, multiplier);
      if (actual !== predicted) {
        throw new Error(
          `width=${width} multiplier=${multiplier} actual=${actual} predicted=${predicted}`,
        );
      }
      checked += 1;
      multipliers += 1;
    }
    rows.push({width, oddMultipliersChecked: checked});
  }
  process.stdout.write(JSON.stringify({
    theorem: 'rank(x -> a*x mod 2^n) = n - v2(a-1) - 1 for odd a != 1',
    exhaustiveWidths: '2..8',
    oddMultipliersChecked: multipliers,
    rows,
  }, null, 2) + '\n');
}

if (require.main === module) main();

module.exports = {
  exhaustiveResidualRank,
  predictedResidualRank,
  rank,
};
