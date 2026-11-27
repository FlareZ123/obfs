'use strict';

/**
 * Deterministic Node.js reproduction of the rank-r section-table shift
 * fingerprint experiment. Synthetic projected-affine sources only; this is
 * not the repository learner, an HTTP test, or a runtime-budget measurement.
 */
const crypto = require('node:crypto');
const DELTA = 1e-10;
const WIDTH = 32;
const REPLICATES = 50;
const HOLDOUTS = 128;

function shaStream(seed) {
  let counter = 0;
  return () => crypto.createHash('sha256')
    .update(String(seed) + ':' + counter++)
    .digest().readUInt32BE(0) >>> 0;
}

function parity32(value) {
  let x = value >>> 0;
  x ^= x >>> 16;
  x ^= x >>> 8;
  x ^= x >>> 4;
  x &= 15;
  return (0x6996 >>> x) & 1;
}

function gf2Rank(vectors, width) {
  const pivots = Array(width).fill(0);
  let rank = 0;
  for (let value of vectors) {
    let x = value >>> 0;
    for (let bit = width - 1; bit >= 0; bit--) {
      if (((x >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) x ^= pivots[bit];
      else {
        pivots[bit] = x >>> 0;
        rank++;
        break;
      }
    }
  }
  return rank;
}

function makeSource(width, rank, seed) {
  const draw = shaStream(seed);
  const mask = width === 32 ? 0xffffffff : (2 ** width - 1) >>> 0;
  const projections = [];
  while (projections.length < rank) {
    const candidate = draw() & mask;
    if (gf2Rank(projections.concat([candidate]), width) > projections.length) {
      projections.push(candidate >>> 0);
    }
  }
  const affine = Array.from({ length: width }, draw);
  const offset = draw();
  const table = Array.from({ length: 2 ** rank }, draw);
  let top = 0;
  for (const value of table) top ^= value;
  if (top === 0) table[table.length - 1] ^= 1;

  return function oracle(input) {
    const x = input >>> 0;
    let index = 0;
    for (let i = 0; i < rank; i++) {
      index |= parity32(x & projections[i]) << i;
    }
    let result = offset;
    for (let bit = 0; bit < width; bit++) {
      if ((x >>> bit) & 1) result ^= affine[bit];
    }
    return (result ^ table[index]) >>> 0;
  };
}

function bounds(rank, width) {
  const p = Array.from({ length: rank }, (_, i) =>
    1 - 2 ** (i - (rank + 1))).reduce((a, b) => a * b, 1);
  const trials = Math.ceil(Math.log(DELTA) / Math.log1p(-p));
  const witness = (2 ** (rank + 1) - 1)
    + (2 ** (rank + 1) - 2) * (trials - 1);
  const verifier = Math.ceil(Math.log(DELTA) / Math.log(1 - 2 ** (-rank)));
  return {
    witnessProbability: p,
    witnessTrials: trials,
    witnessCap: witness,
    verifierSamples: verifier,
    lazySignatureCap: witness + (2 ** rank - 1) * width + verifier,
    shiftCap: witness + 3 * width + verifier,
  };
}

function learn(oracle, width, rank, drawWitness, drawVerify, strategy) {
  const mask = width === 32 ? 0xffffffff : (2 ** width - 1) >>> 0;
  const cache = new Map();
  function ask(input) {
    const x = input & mask;
    if (!cache.has(x)) cache.set(x, oracle(x) >>> 0);
    return cache.get(x);
  }
  function derivative(directions) {
    let result = 0;
    for (let subset = 0; subset < (1 << directions.length); subset++) {
      let input = 0;
      for (let bit = 0; bit < directions.length; bit++) {
        if ((subset >>> bit) & 1) input ^= directions[bit];
      }
      result ^= ask(input);
    }
    return result >>> 0;
  }

  const { witnessTrials, verifierSamples } = bounds(rank, width);
  let witness = 0;
  let anchors = null;
  let trials = 0;
  for (let trial = 0; trial < witnessTrials; trial++) {
    const directions = Array.from({ length: rank + 1 }, () => drawWitness() & mask);
    for (let omitted = 0; omitted < rank + 1; omitted++) {
      const face = directions.filter((_, index) => index !== omitted);
      const observed = derivative(face);
      if (observed !== 0) {
        witness = observed;
        anchors = face;
        trials = trial + 1;
        break;
      }
    }
    if (witness !== 0) break;
    trials = trial + 1;
  }
  if (witness === 0) throw new Error('no witness at rank ' + rank);

  const table = Array(1 << rank);
  for (let index = 0; index < table.length; index++) {
    let representative = 0;
    for (let bit = 0; bit < rank; bit++) {
      if ((index >>> bit) & 1) representative ^= anchors[bit];
    }
    table[index] = ask(representative);
  }

  const coordinates = [];
  const corrections = [];
  let fixedPairPasses = null;
  if (strategy === 'shift') {
    fixedPairPasses = true;
    const count = 1 << rank;
    for (let base = 0; base < count && fixedPairPasses; base++) {
      for (let delta = 1; delta < count; delta++) {
        const pair = table[base] ^ table[base ^ delta];
        const along0 = pair ^ table[base ^ 1] ^ table[base ^ 1 ^ delta];
        const along1 = pair ^ table[base ^ 2] ^ table[base ^ 2 ^ delta];
        if (along0 === 0 && along1 === 0) {
          fixedPairPasses = false;
          break;
        }
      }
    }
  }

  if (strategy === 'shift' && fixedPairPasses) {
    for (let bit = 0; bit < width; bit++) {
      const basis = (1 << bit) >>> 0;
      const f0 = ask(basis);
      const f1 = ask(basis ^ anchors[0]);
      const f2 = ask(basis ^ anchors[1]);
      const candidates = [];
      for (let q = 0; q < table.length; q++) {
        const correction = f0 ^ table[q];
        if ((f1 ^ table[q ^ 1]) === correction &&
            (f2 ^ table[q ^ 2]) === correction) {
          candidates.push([q, correction >>> 0]);
        }
      }
      if (candidates.length !== 1) {
        throw new Error('shift ambiguity at rank ' + rank + ', bit ' + bit);
      }
      coordinates.push(candidates[0][0]);
      corrections.push(candidates[0][1]);
    }
  } else {
    for (let bit = 0; bit < width; bit++) {
      const basis = (1 << bit) >>> 0;
      let quotient = 0;
      for (let omitted = 0; omitted < rank; omitted++) {
        const directions = [basis].concat(
          anchors.filter((_, index) => index !== omitted));
        const observed = derivative(directions);
        if (observed !== 0 && observed !== witness) {
          throw new Error('signature overflow at rank ' + rank + ', bit ' + bit);
        }
        if (observed === witness) quotient |= 1 << omitted;
      }
      coordinates.push(quotient);
      corrections.push((ask(basis) ^ table[quotient]) >>> 0);
    }
  }

  function model(input) {
    const x = input >>> 0;
    let quotient = 0;
    let correction = 0;
    for (let bit = 0; bit < width; bit++) {
      if ((x >>> bit) & 1) {
        quotient ^= coordinates[bit];
        correction ^= corrections[bit];
      }
    }
    return (table[quotient] ^ correction) >>> 0;
  }

  for (let i = 0; i < verifierSamples; i++) {
    const input = drawVerify() & mask;
    if (ask(input) !== model(input)) {
      throw new Error('verifier mismatch at rank ' + rank);
    }
  }
  return { queries: cache.size, trials, model, fixedPairPasses };
}

function main() {
  const summary = {};
  let holdoutChecks = 0;
  let fixedPairPasses = 0;
  let totalSaved = 0;
  for (let rank = 2; rank <= 8; rank++) {
    const signatureCounts = [];
    const shiftCounts = [];
    for (let replicate = 0; replicate < REPLICATES; replicate++) {
      const seed = replicate + 1000 * rank;
      const oracle = makeSource(WIDTH, rank, 0x70000000 + seed);
      const signature = learn(
        oracle, WIDTH, rank,
        shaStream(0x72000000 + seed),
        shaStream(0x73000000 + seed),
        'signature',
      );
      const shift = learn(
        oracle, WIDTH, rank,
        shaStream(0x72000000 + seed),
        shaStream(0x73000000 + seed),
        'shift',
      );
      if (shift.fixedPairPasses) fixedPairPasses++;
      const heldout = shaStream(0x74000000 + seed);
      for (let i = 0; i < HOLDOUTS; i++) {
        const input = heldout();
        if (oracle(input) !== signature.model(input)) {
          throw new Error('signature holdout mismatch at rank ' + rank);
        }
        if (oracle(input) !== shift.model(input)) {
          throw new Error('shift holdout mismatch at rank ' + rank);
        }
        holdoutChecks++;
      }
      signatureCounts.push(signature.queries);
      shiftCounts.push(shift.queries);
    }
    const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
    const max = values => Math.max(...values);
    const signatureMean = mean(signatureCounts);
    const shiftMean = mean(shiftCounts);
    const saved = signatureMean - shiftMean;
    totalSaved += signatureCounts.reduce(
      (sum, value, index) => sum + value - shiftCounts[index], 0);
    summary[rank] = {
      signatureMean,
      shiftMean,
      meanSaved: saved,
      reductionPercent: 100 * saved / signatureMean,
      signatureMax: max(signatureCounts),
      shiftMax: max(shiftCounts),
      ...bounds(rank, WIDTH),
    };
  }
  process.stdout.write(JSON.stringify({
    node: process.version,
    replicatesPerRank: REPLICATES,
    holdoutsPerSource: HOLDOUTS,
    sourceCount: REPLICATES * 7,
    holdoutChecks,
    fixedPairPasses,
    totalSaved,
    summary,
  }, null, 2) + '\n');
}

main();
