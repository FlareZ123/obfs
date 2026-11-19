'use strict';

const assert = require('node:assert/strict');
const {finiteDifferenceRank} = require('./vector-boolean-profile.js');

const WIDTH = 3;
const SIZE = 1 << WIDTH;

/** @param {number} value @returns {number} */
function mask(value) {
  return value & (SIZE - 1);
}

/** @param {number[]} vectors @returns {number[]} */
function basis(vectors) {
  const pivots = Array(WIDTH).fill(0);
  const result = [];
  for (const original of vectors) {
    let value = mask(original);
    for (let bit = WIDTH - 1; bit >= 0 && value !== 0; bit -= 1) {
      if (((value >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) {
        value ^= pivots[bit];
      } else {
        pivots[bit] = value;
        result.push(mask(original));
        break;
      }
    }
  }
  return result;
}

/** @param {number[]} vectors @returns {Set<number>} */
function spanSet(vectors) {
  const result = new Set([0]);
  for (const vector of basis(vectors)) {
    for (const prior of [...result]) result.add(mask(prior ^ vector));
  }
  return result;
}

/** @param {number} value @returns {number} */
function popcount(value) {
  let x = mask(value);
  let count = 0;
  while (x !== 0) {
    count += x & 1;
    x >>>= 1;
  }
  return count;
}

/** @param {number[]} values @returns {number[]} */
function vectorAnfCoefficients(values) {
  const coefficients = values.map(mask);
  for (let bit = 0; bit < WIDTH; bit += 1) {
    for (let subset = 0; subset < SIZE; subset += 1) {
      if (((subset >>> bit) & 1) !== 0) {
        coefficients[subset] ^= coefficients[subset ^ (1 << bit)];
      }
    }
  }
  return coefficients.map(mask);
}

/** @param {number[]} values @returns {number[]} */
function degreeQuotientRanks(values) {
  const coefficients = vectorAnfCoefficients(values);
  return Array.from({length: WIDTH + 1}, (_, maxDegree) => basis(
    coefficients.filter(
      (coefficient, subset) => coefficient !== 0 && popcount(subset) > maxDegree,
    ),
  ).length);
}

/** @param {number} value @returns {number} */
function parity(value) {
  let x = mask(value);
  let bit = 0;
  while (x !== 0) {
    bit ^= x & 1;
    x >>>= 1;
  }
  return bit;
}

/** @param {number[]} columns @param {number} input @returns {number} */
function applyLinear(columns, input) {
  let output = 0;
  for (let bit = 0; bit < WIDTH; bit += 1) {
    if (((input >>> bit) & 1) !== 0) output ^= columns[bit];
  }
  return mask(output);
}

/**
 * @param {number[]} permutation
 * @returns {{rank:number,residualBasis:number[],nullity:number}}
 */
function residualData(permutation) {
  const constant = permutation[0];
  const columns = Array.from(
    {length: WIDTH},
    (_, bit) => mask(permutation[1 << bit] ^ constant),
  );
  const residuals = permutation.map(
    (output, input) => mask(output ^ constant ^ applyLinear(columns, input)),
  );
  return {
    rank: basis(residuals).length,
    residualBasis: basis(residuals),
    nullity: WIDTH - basis(columns).length,
  };
}

/**
 * @param {number[]} values
 * @returns {boolean}
 */
function isAffineBoolean(values) {
  const constant = values[0] & 1;
  const coefficients = Array.from(
    {length: WIDTH},
    (_, bit) => (values[1 << bit] ^ constant) & 1,
  );
  for (let input = 0; input < SIZE; input += 1) {
    let expected = constant;
    for (let bit = 0; bit < WIDTH; bit += 1) {
      if (((input >>> bit) & 1) !== 0) expected ^= coefficients[bit];
    }
    if ((values[input] & 1) !== expected) return false;
  }
  return true;
}

/**
 * Return output masks lambda for which lambda(F(x)) is affine in x.
 * @param {number[]} permutation
 * @returns {number[]}
 */
function affineOutputMasks(permutation) {
  const masks = [];
  for (let outputMask = 0; outputMask < SIZE; outputMask += 1) {
    const values = permutation.map((output) => parity(outputMask & output));
    if (isAffineBoolean(values)) masks.push(outputMask);
  }
  return masks;
}

/** @param {number} input @returns {number} */
function swap01(input) {
  const bit0 = input & 1;
  const bit1 = (input >>> 1) & 1;
  return mask((input & ~3) | (bit0 << 1) | bit1);
}

/** @param {number} input @returns {number} */
function swap12(input) {
  const bit1 = (input >>> 1) & 1;
  const bit2 = (input >>> 2) & 1;
  return mask((input & ~6) | (bit1 << 2) | (bit2 << 1));
}

/** @param {number} input @returns {number} */
function shear01(input) {
  return mask(input ^ (((input >>> 1) & 1) << 0));
}

/**
 * @param {number[]} permutation
 * @param {(input:number)=>number} transform
 * @returns {number[]}
 */
function precompose(permutation, transform) {
  return Array.from({length: SIZE}, (_, input) => permutation[transform(input)]);
}

/**
 * @param {number[]} permutation
 * @param {(output:number)=>number} transform
 * @returns {number[]}
 */
function postcompose(permutation, transform) {
  return permutation.map(transform);
}

/**
 * Construct a domain basis at a fixed origin whose output differences are
 * simultaneously independent. Full permutation access is used only for this
 * finite-width proof audit.
 * @param {number[]} permutation
 * @param {number} origin
 * @returns {{domainBasis:number[],outputBasis:number[]}}
 */
function simultaneousBasis(permutation, origin) {
  /** @type {number[]} */
  const domainBasis = [];
  /** @type {number[]} */
  const outputBasis = [];
  while (domainBasis.length < WIDTH) {
    const domainSpan = spanSet(domainBasis);
    const outputSpan = spanSet(outputBasis);
    let selected = -1;
    for (let input = 0; input < SIZE; input += 1) {
      const domainDifference = mask(input ^ origin);
      const outputDifference = mask(permutation[input] ^ permutation[origin]);
      if (!domainSpan.has(domainDifference) && !outputSpan.has(outputDifference)) {
        selected = input;
        break;
      }
    }
    assert.ok(selected >= 0, 'greedy simultaneous affine basis must extend');
    domainBasis.push(mask(selected ^ origin));
    outputBasis.push(mask(permutation[selected] ^ permutation[origin]));
  }
  return {domainBasis, outputBasis};
}

/**
 * @param {number[]} values
 * @param {number} index
 * @param {(permutation:number[])=>void} visit
 */
function permute(values, index, visit) {
  if (index === values.length) {
    visit(values);
    return;
  }
  for (let swap = index; swap < values.length; swap += 1) {
    [values[index], values[swap]] = [values[swap], values[index]];
    permute(values, index + 1, visit);
    [values[index], values[swap]] = [values[swap], values[index]];
  }
}

function main() {
  const domainGenerators = [
    (/** @type {number} */ input) => mask(input ^ 1),
    (/** @type {number} */ input) => mask(input ^ 2),
    (/** @type {number} */ input) => mask(input ^ 4),
    swap01,
    swap12,
    shear01,
  ];
  const outputGenerators = [
    (/** @type {number} */ output) => mask(output ^ 1),
    (/** @type {number} */ output) => mask(output ^ 2),
    (/** @type {number} */ output) => mask(output ^ 4),
    swap01,
    swap12,
    shear01,
  ];

  let permutations = 0;
  let originsAudited = 0;
  let generatorChecks = 0;
  let hierarchyChecks = 0;
  const standardRegimes = new Map();

  permute(Array.from({length: SIZE}, (_, index) => index), 0, (permutation) => {
    permutations += 1;
    const standard = residualData(permutation);
    const standardDegreeRanks = degreeQuotientRanks(permutation);
    assert.equal(standardDegreeRanks[1], standard.rank);
    for (let maxDegree = 0; maxDegree < WIDTH; maxDegree += 1) {
      assert.equal(
        finiteDifferenceRank(permutation, maxDegree + 1),
        standardDegreeRanks[maxDegree],
        'finite-difference span must equal the corresponding ANF degree quotient',
      );
    }
    const affineMasks = affineOutputMasks(permutation);
    const anf = vectorAnfCoefficients(permutation);
    const nonlinearCoefficients = anf.filter(
      (coefficient, subset) => popcount(subset) >= 2 && coefficient !== 0,
    );
    assert.deepEqual(
      [...spanSet(nonlinearCoefficients)].sort((a, b) => a - b),
      [...spanSet(standard.residualBasis)].sort((a, b) => a - b),
      'nonlinear ANF coefficient span must equal the intrinsic residual space',
    );

    assert.equal(
      basis(affineMasks).length,
      WIDTH - standard.rank,
      'annihilator dimension must equal n-r',
    );

    for (const lambda of affineMasks) {
      for (const residual of standard.residualBasis) {
        assert.equal(parity(lambda & residual), 0, 'affine mask must annihilate R');
      }
    }

    for (const transform of domainGenerators) {
      const transformed = precompose(permutation, transform);
      assert.equal(
        residualData(transformed).rank,
        standard.rank,
        'domain affine generator must preserve residual rank',
      );
      assert.deepEqual(
        degreeQuotientRanks(transformed),
        standardDegreeRanks,
        'domain affine generator must preserve the degree-quotient hierarchy',
      );
      generatorChecks += 1;
      hierarchyChecks += 1;
    }

    for (const transform of outputGenerators) {
      const transformed = postcompose(permutation, transform);
      assert.equal(
        residualData(transformed).rank,
        standard.rank,
        'output affine generator must preserve residual rank',
      );
      assert.deepEqual(
        degreeQuotientRanks(transformed),
        standardDegreeRanks,
        'output affine generator must preserve the degree-quotient hierarchy',
      );
      generatorChecks += 1;
      hierarchyChecks += 1;
    }

    for (let origin = 0; origin < SIZE; origin += 1) {
      const frame = simultaneousBasis(permutation, origin);
      assert.equal(basis(frame.domainBasis).length, WIDTH);
      assert.equal(basis(frame.outputBasis).length, WIDTH);
      originsAudited += 1;
    }

    const key = `${standard.rank}:${standard.nullity}`;
    standardRegimes.set(key, (standardRegimes.get(key) ?? 0) + 1);
  });

  console.log(JSON.stringify({
    width: WIDTH,
    permutations,
    originsAudited,
    generatorChecks,
    hierarchyChecks,
    standardRegimes: Object.fromEntries([...standardRegimes.entries()].sort()),
  }, null, 2));
}

main();
