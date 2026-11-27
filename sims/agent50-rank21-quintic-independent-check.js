'use strict';

const assert = require('node:assert/strict');

/** @typedef {number[]} GF2Columns */
/** @typedef {{ topMasks: number[], terms: number[][] }} Rank21Terms */

/** @param {number} seed @returns {() => number} */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** @param {number} value @returns {number} */
function popcount(value) {
  let count = 0;
  for (let x = value >>> 0; x !== 0; x &= x - 1) count++;
  return count;
}

/** @param {number} seed @returns {GF2Columns} */
function makeLinearTransform(seed) {
  const next = seeded(seed);
  const columns = Array.from({ length: 32 }, (_, bit) => 1 << bit);
  for (let i = 0; i < 512; i++) {
    let a = next() % 32;
    let b = next() % 32;
    if (a === b) b = (b + 1) % 32;
    if ((next() & 1) === 0) {
      const temporary = columns[a];
      columns[a] = columns[b];
      columns[b] = temporary;
    } else {
      columns[b] = (columns[b] ^ columns[a]) >>> 0;
    }
  }
  return columns;
}

/** @param {GF2Columns} columns @param {number} input @returns {number} */
function applyLinear(columns, input) {
  let x = input >>> 0;
  let output = 0;
  let bit = 0;
  while (x !== 0) {
    if (x & 1) output = (output ^ columns[bit]) >>> 0;
    x >>>= 1;
    bit++;
  }
  return output >>> 0;
}

/** @param {number[]} columns @param {number} bits @returns {number} */
function rankColumns(columns, bits) {
  const basis = Array(bits).fill(0);
  let rank = 0;
  for (const value0 of columns) {
    let value = value0 >>> 0;
    for (let bit = bits - 1; bit >= 0; bit--) {
      if (!((value >>> bit) & 1)) continue;
      if (basis[bit]) {
        value = (value ^ basis[bit]) >>> 0;
      } else {
        basis[bit] = value;
        rank++;
        break;
      }
    }
  }
  return rank;
}

/** @param {number[]} basis @param {number} vector @param {number} [bits=32] @returns {boolean} */
function extendBasis(basis, vector, bits = 32) {
  let remaining = vector >>> 0;
  for (let bit = bits - 1; bit >= 0; bit--) {
    if (!((remaining >>> bit) & 1)) continue;
    if (basis[bit]) {
      remaining = (remaining ^ basis[bit]) >>> 0;
    } else {
      basis[bit] = remaining;
      return true;
    }
  }
  return false;
}

/** @param {GF2Columns} columns @returns {GF2Columns} */
function inverseColumns(columns) {
  const bits = columns.length;
  const rows = [];
  for (let row = 0; row < bits; row++) {
    let left = 0;
    for (let col = 0; col < bits; col++) {
      if ((columns[col] >>> row) & 1) left ^= 1 << col;
    }
    rows.push({ left: left >>> 0, right: (1 << row) >>> 0 });
  }
  for (let pivot = 0; pivot < bits; pivot++) {
    let selected = -1;
    for (let row = pivot; row < bits; row++) {
      if ((rows[row].left >>> pivot) & 1) {
        selected = row;
        break;
      }
    }
    if (selected < 0) throw new Error('singular matrix');
    [rows[pivot], rows[selected]] = [rows[selected], rows[pivot]];
    for (let row = 0; row < bits; row++) {
      if (row !== pivot && ((rows[row].left >>> pivot) & 1)) {
        rows[row].left = (rows[row].left ^ rows[pivot].left) >>> 0;
        rows[row].right = (rows[row].right ^ rows[pivot].right) >>> 0;
      }
    }
  }
  return Array.from({ length: bits }, (_, column) => {
    let value = 0;
    for (let row = 0; row < bits; row++) {
      if ((rows[row].right >>> column) & 1) value ^= 1 << row;
    }
    return value >>> 0;
  });
}

/** @param {number} seed @returns {Rank21Terms} */
function makeRank21Terms(seed) {
  const next = seeded(seed);
  const topMasks = Array.from({ length: 128 }, (_, mask) => mask)
    .filter((mask) => popcount(mask) === 5);
  const terms = Array.from({ length: 32 }, () => []);
  for (let outputBit = 7; outputBit < 28; outputBit++) {
    const selected = [topMasks[outputBit - 7]];
    const seen = new Set(selected);
    for (let term = 0; term < 5; term++) {
      const degree = 2 + (next() % 3);
      let mask = 0;
      while (popcount(mask) < degree) {
        const inputBit = next() % outputBit;
        mask |= 1 << inputBit;
      }
      if (!seen.has(mask)) {
        seen.add(mask);
        selected.push(mask);
      }
    }
    terms[outputBit] = selected;
  }
  return { topMasks, terms };
}

const { topMasks, terms } = makeRank21Terms(0x5eed21);

/** @param {number} input @returns {number} */
function rank21Triangular(input) {
  const x = input >>> 0;
  let output = x;
  for (let outputBit = 7; outputBit < 28; outputBit++) {
    let gate = 0;
    for (const mask of terms[outputBit]) {
      if ((x & mask) === mask) gate ^= 1;
    }
    if (gate) output = (output ^ (1 << outputBit)) >>> 0;
  }
  return output >>> 0;
}

/** @param {number[]} directions @returns {number} */
function fifthDerivativeVector(directions) {
  let output = 0;
  for (let subset = 0; subset < 32; subset++) {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      if ((subset >>> i) & 1) value ^= directions[i];
    }
    for (let k = 0; k < topMasks.length; k++) {
      const mask = topMasks[k];
      if ((value & mask) === mask) output = (output ^ (1 << k)) >>> 0;
    }
  }
  return output >>> 0;
}

/** @returns {{ fourTupleCount: number, radical: number[], radicalSize: number, codimension: number }} */
function jointRadicalEvidence() {
  const basis = Array.from({ length: 7 }, (_, bit) => 1 << bit);
  const fourTuples = [];
  for (let a = 0; a < 7; a++) {
    for (let b = a + 1; b < 7; b++) {
      for (let c = b + 1; c < 7; c++) {
        for (let d = c + 1; d < 7; d++) {
          fourTuples.push([basis[a], basis[b], basis[c], basis[d]]);
        }
      }
    }
  }
  const radical = [];
  for (let value = 0; value < 128; value++) {
    let isRadical = true;
    for (const directions of fourTuples) {
      if (fifthDerivativeVector([value, ...directions]) !== 0) {
        isRadical = false;
        break;
      }
    }
    if (isRadical) radical.push(value);
  }
  return {
    fourTupleCount: fourTuples.length,
    radical,
    radicalSize: radical.length,
    codimension: 7 - Math.log2(radical.length),
  };
}

/** @param {number} target @param {number} sampleSeed @param {number} rankBound @returns {object} */
function invertLowRank(target, sampleSeed, rankBound, oracleFn = oracle) {
  let calls = 0;
  const query = (input) => {
    calls++;
    return oracleFn(input >>> 0);
  };
  const constant = query(0);
  const columns = Array.from({ length: 32 }, (_, bit) =>
    (query(1 << bit) ^ constant) >>> 0);
  const basis = Array(32).fill(0);
  const freeColumns = [];
  for (let bit = 0; bit < 32; bit++) {
    if (!extendBasis(basis, columns[bit])) freeColumns.push(bit);
  }
  const nullity = freeColumns.length;
  assert.ok(nullity <= rankBound);

  const nextSample = seeded(sampleSeed);
  const residuals = [];
  let samplingCalls = 0;
  while (residuals.length < nullity) {
    const input = nextSample();
    const residual = (query(input) ^ constant ^ applyLinear(columns, input)) >>> 0;
    samplingCalls++;
    if (extendBasis(basis, residual)) residuals.push(residual);
    if (samplingCalls >= 96 && residuals.length < nullity) {
      throw new Error('sampling cap exhausted');
    }
  }

  const completed = columns.slice();
  for (let i = 0; i < freeColumns.length; i++) {
    const column = freeColumns[i];
    completed[column] = (columns[column] ^ residuals[i]) >>> 0;
  }
  const inverse = inverseColumns(completed);
  const wanted = applyLinear(inverse, (target ^ constant) >>> 0);
  let current = wanted;
  const maxOrbit = 2 ** rankBound;
  for (let step = 1; step <= maxOrbit; step++) {
    const next = applyLinear(inverse, (query(current) ^ constant) >>> 0);
    if (next === wanted) {
      return {
        preimage: current,
        calls,
        interpolationCalls: 33,
        samplingCalls,
        orbitCalls: step,
        nullity,
      };
    }
    current = next;
  }
  throw new Error('orbit cap exhausted');
}

const inputLinear = makeLinearTransform(0x12345678);
const outputLinear = makeLinearTransform(0x9abcdef0);
const inputInverse = inverseColumns(inputLinear);
const inputBias = 0x13579bdf;
const outputBias = 0x2468ace0;

/** @param {number} input @returns {number} */
function oracle(input) {
  const hidden = (applyLinear(inputLinear, input) ^ inputBias) >>> 0;
  return (applyLinear(outputLinear, rank21Triangular(hidden)) ^ outputBias) >>> 0;
}

function main() {
  assert.equal(topMasks.length, 21);
  let union = 0;
  for (const mask of topMasks) union |= mask;
  assert.equal(union, 0x7f);
  assert.ok(terms.slice(7, 28).every((list) => list.length === 6));
  assert.ok(terms.slice(7, 28).every((list) =>
    list.slice(1).every((mask) => popcount(mask) >= 2 && popcount(mask) <= 4)));

  const displacementValues = Array.from({ length: 128 }, (_, input) =>
    (rank21Triangular(input) ^ input) >>> 7);
  const displacementRank = rankColumns(displacementValues, 21);
  const affineColumns = Array.from({ length: 32 }, (_, bit) =>
    applyLinear(outputLinear, applyLinear(inputLinear, 1 << bit)));
  const nonlinearDirections = Array.from({ length: 21 }, (_, bit) =>
    applyLinear(outputLinear, 1 << (bit + 7)));
  const radical = jointRadicalEvidence();

  assert.equal(displacementRank, 21);
  assert.equal(rankColumns(affineColumns, 32), 32);
  assert.equal(rankColumns(nonlinearDirections, 32), 21);
  assert.equal(radical.radicalSize, 1);
  assert.equal(radical.radical[0], 0);
  assert.equal(radical.codimension, 7);

  const hiddenTargets = [
    0x67aa29ff, 0x628acbfe, 0xfe1940fd, 0xc1ece67b,
    0x3e411777, 0x37fff36f, 0xbd72765f, 0x8721e5bf,
  ];
  const expectedCalls = [121616, 2082224, 1771722, 198219, 959413, 1343261, 214296, 1549526];
  const expectedOrbits = [121581, 2082189, 1771687, 198184, 959378, 1343226, 214261, 1549491];
  const receipts = [];
  for (let index = 0; index < hiddenTargets.length; index++) {
    const secret = applyLinear(inputInverse, (hiddenTargets[index] ^ inputBias) >>> 0);
    const target = oracle(secret);
    const result = invertLowRank(target, 0x12345678, 21);
    assert.equal(result.preimage, secret);
    assert.equal(oracle(result.preimage), target);
    assert.equal(result.nullity, 1);
    assert.equal(result.samplingCalls, 2);
    assert.equal(result.calls, expectedCalls[index]);
    assert.equal(result.orbitCalls, expectedOrbits[index]);
    receipts.push({
      index,
      secret: '0x' + secret.toString(16).padStart(8, '0'),
      target: '0x' + target.toString(16).padStart(8, '0'),
      calls: result.calls,
      nullity: result.nullity,
      samplingCalls: result.samplingCalls,
      orbitCalls: result.orbitCalls,
    });
  }

  const totalCalls = receipts.reduce((sum, item) => sum + item.calls, 0);
  const totalOrbitCalls = receipts.reduce((sum, item) => sum + item.orbitCalls, 0);
  assert.equal(totalCalls, 8240277);
  assert.equal(totalOrbitCalls, 8239997);

  const wrappers = [
    { inputSeed: 0x12345678, outputSeed: 0x9abcdef0, inputBias: 0x13579bdf, outputBias: 0x2468ace0 },
    { inputSeed: 0x31415926, outputSeed: 0x27182818, inputBias: 0xdeadbeef, outputBias: 0xcafebabe },
  ];
  const sampleSeeds = [0x12345678, 0xdeadbeef];
  const sweepReceipts = [];
  for (let wrapperIndex = 0; wrapperIndex < wrappers.length; wrapperIndex++) {
    const wrapper = wrappers[wrapperIndex];
    const inputColumns = makeLinearTransform(wrapper.inputSeed);
    const outputColumns = makeLinearTransform(wrapper.outputSeed);
    const inputInverse = inverseColumns(inputColumns);
    const wrappedOracle = (input) => {
      const hidden = (applyLinear(inputColumns, input) ^ wrapper.inputBias) >>> 0;
      return (applyLinear(outputColumns, rank21Triangular(hidden)) ^ wrapper.outputBias) >>> 0;
    };
    for (let sampleIndex = 0; sampleIndex < sampleSeeds.length; sampleIndex++) {
      for (let targetIndex = 0; targetIndex < hiddenTargets.length; targetIndex++) {
        const secret = applyLinear(inputInverse, (hiddenTargets[targetIndex] ^ wrapper.inputBias) >>> 0);
        const target = wrappedOracle(secret);
        const result = invertLowRank(target, sampleSeeds[sampleIndex], 21, wrappedOracle);
        assert.equal(result.preimage, secret);
        assert.equal(wrappedOracle(result.preimage), target);
        assert.equal(result.nullity, 1);
        assert.equal(result.calls, 33 + result.samplingCalls + result.orbitCalls);
        sweepReceipts.push({ wrapperIndex, sampleIndex, targetIndex, calls: result.calls,
          samples: result.samplingCalls, orbit: result.orbitCalls, nullity: result.nullity });
      }
    }
  }
  const sweepCalls = sweepReceipts.map((item) => item.calls);
  const sweepTotal = sweepCalls.reduce((sum, value) => sum + value, 0);
  const sweepMin = Math.min(...sweepCalls);
  const sweepMax = Math.max(...sweepCalls);
  const sweepMinSamples = Math.min(...sweepReceipts.map((item) => item.samples));
  const sweepMaxSamples = Math.max(...sweepReceipts.map((item) => item.samples));
  const sweepMinOrbit = Math.min(...sweepReceipts.map((item) => item.orbit));
  const sweepMaxOrbit = Math.max(...sweepReceipts.map((item) => item.orbit));
  assert.equal(sweepReceipts.length, 32);
  assert.equal(sweepTotal, 32341215);
  assert.equal(sweepMin, 4011);
  assert.equal(sweepMax, 2082224);
  assert.equal(sweepMinSamples, 1);
  assert.equal(sweepMaxSamples, 2);
  assert.equal(sweepMinOrbit, 3977);
  assert.equal(sweepMaxOrbit, 2082189);
  const batchMaxOrbits = [];
  for (let wrapperIndex = 0; wrapperIndex < 2; wrapperIndex++) {
    for (let sampleIndex = 0; sampleIndex < 2; sampleIndex++) {
      const batch = sweepReceipts.filter((item) =>
        item.wrapperIndex === wrapperIndex && item.sampleIndex === sampleIndex);
      batchMaxOrbits.push(Math.max(...batch.map((item) => item.orbit)));
    }
  }
  assert.deepEqual(batchMaxOrbits, [2082189, 2048076, 2064800, 2074107]);

  console.log(JSON.stringify({
    result: 'PASS',
    source: {
      topMaskCount: topMasks.length,
      topMaskUnion: '0x' + union.toString(16),
      lowerDegreeTermsPerOutput: terms.slice(7, 28).map((list) => list.length - 1),
      displacementRank,
      affineRank: rankColumns(affineColumns, 32),
      nonlinearOutputDirectionRank: rankColumns(nonlinearDirections, 32),
      jointTopDerivativeRadical: radical,
    },
    receipts,
    totalLowRankCalls: totalCalls,
    totalOrbitCalls,
    totalSamplingCalls: receipts.reduce((sum, item) => sum + item.samplingCalls, 0),
    sweep32: {
      cases: sweepReceipts.length,
      totalLowRankQueries: sweepTotal,
      minPerTarget: sweepMin,
      maxPerTarget: sweepMax,
      minSamples: sweepMinSamples,
      maxSamples: sweepMaxSamples,
      minOrbit: sweepMinOrbit,
      maxOrbit: sweepMaxOrbit,
      nullities: [1],
      batchMaxOrbits,
    },
  }, null, 2));
}

main();
