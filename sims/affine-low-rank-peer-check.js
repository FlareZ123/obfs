'use strict';

const assert = require('node:assert/strict');

/** @param {number[]} columns @param {number} x @returns {number} */
function linear(columns, x) {
  let result = 0;
  for (let i = 0; i < columns.length; i++) {
    if ((x >>> i) & 1) result = (result ^ columns[i]) >>> 0;
  }
  return result;
}

/** @param {number[]} vectors @returns {number} */
function rank(vectors) {
  const pivots = new Map();
  for (const vector of vectors) {
    let v = vector >>> 0;
    while (v !== 0) {
      const position = 31 - Math.clz32(v);
      const previous = pivots.get(position);
      if (previous === undefined) {
        pivots.set(position, v);
        break;
      }
      v = (v ^ previous) >>> 0;
    }
  }
  return pivots.size;
}

/** @param {number[]} columns @returns {number[]} */
function inverse(columns) {
  const n = columns.length;
  const rows = Array.from({length: n}, (_, i) => ({
    left: columns.reduce((acc, col, j) => (acc | (((col >>> i) & 1) << j)) >>> 0, 0),
    right: (2 ** i) >>> 0
  }));
  for (let p = 0; p < n; p++) {
    const selected = rows.findIndex((row, i) => i >= p && ((row.left >>> p) & 1) !== 0);
    assert.ok(selected >= p, 'completion must be invertible');
    [rows[p], rows[selected]] = [rows[selected], rows[p]];
    for (let j = 0; j < n; j++) {
      if (j !== p && ((rows[j].left >>> p) & 1)) {
        rows[j].left = (rows[j].left ^ rows[p].left) >>> 0;
        rows[j].right = (rows[j].right ^ rows[p].right) >>> 0;
      }
    }
  }
  return Array.from({length: n}, (_, i) => rows.reduce((acc, row, j) =>
    (acc | (((row.right >>> i) & 1) << j)) >>> 0, 0));
}

/** @param {number} seed @returns {()=>number} */
function prng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/**
 * Independent construction: extend the quotient basis with F(x)^F(0),
 * then derive replacement-column deltas. The original implementation
 * instead extends its basis with the residuals directly.
 * @param {(x:number)=>number} oracle
 * @param {number} bits
 * @param {number} bound
 * @param {number} target
 * @param {()=>number} rand
 * @returns {{preimage:number,nullity:number,samples:number,orbit:number}}
 */
function peerInvert(oracle, bits, bound, target, rand) {
  const constant = oracle(0);
  const interpolant = Array.from({length: bits}, (_, j) =>
    (oracle((2 ** j) >>> 0) ^ constant) >>> 0);
  const known = [];
  const free = [];
  for (let j = 0; j < bits; j++) {
    if (rank([...known, interpolant[j]]) > known.length) known.push(interpolant[j]);
    else free.push(j);
  }
  assert.ok(free.length <= bound, 'rank promise violated');
  const corrections = [];
  let samples = 0;
  while (corrections.length !== free.length) {
    const x = rand() % (2 ** bits);
    const outputDifference = (oracle(x) ^ constant) >>> 0;
    samples++;
    assert.ok(samples < 1000, 'quotient random sampling did not complete');
    if (rank([...known, outputDifference]) > known.length) {
      known.push(outputDifference);
      corrections.push((outputDifference ^ linear(interpolant, x)) >>> 0);
    }
  }
  const h = interpolant.slice();
  for (let j = 0; j < free.length; j++) h[free[j]] = (h[free[j]] ^ corrections[j]) >>> 0;
  assert.equal(rank(h), bits);
  const hInverse = inverse(h);
  const wanted = linear(hInverse, (target ^ constant) >>> 0);
  let x = wanted;
  for (let orbit = 1; orbit <= 2 ** bound; orbit++) {
    const next = linear(hInverse, (oracle(x) ^ constant) >>> 0);
    if (next === wanted) return {preimage: x, nullity: free.length, samples, orbit};
    x = next;
  }
  throw new Error('orbit exceeded rank bound');
}

/** @param {number} n @param {()=>number} rand @returns {number[]} */
function invertibleColumns(n, rand) {
  const cols = Array.from({length: n}, (_, i) => (2 ** i) >>> 0);
  for (let step = 0; step < 16 * n; step++) {
    const a = rand() % n;
    const b = (a + 1 + rand() % (n - 1)) % n;
    cols[a] = (cols[a] ^ cols[b]) >>> 0;
  }
  assert.equal(rank(cols), n);
  return cols;
}

/** @param {number[]} a @returns {Generator<number[]>} */
function* permutations(a) {
  if (a.length === 0) { yield []; return; }
  for (let i = 0; i < a.length; i++) {
    const remaining = [...a.slice(0, i), ...a.slice(i + 1)];
    for (const rest of permutations(remaining)) yield [a[i], ...rest];
  }
}

/** @param {number} x @returns {number} */
function diffuse(x) {
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function main() {
  const summary = {targets3: 0, hiddenAffineTargets: 0, width32Targets: 0,
    singularTargets: 0, maxSamples: 0, maxOrbit: 0, maxNullity: 0};
  /** @param {(x:number)=>number} oracle @param {number} bits @param {number} bound @param {number} x @param {number} seed */
  function verify(oracle, bits, bound, x, seed) {
    const y = oracle(x);
    const v = peerInvert(oracle, bits, bound, y, prng(seed));
    assert.equal(v.preimage, x);
    assert.equal(oracle(v.preimage), y);
    summary.maxSamples = Math.max(summary.maxSamples, v.samples);
    summary.maxOrbit = Math.max(summary.maxOrbit, v.orbit);
    summary.maxNullity = Math.max(summary.maxNullity, v.nullity);
    return v;
  }

  let i = 0;
  for (const permutation of permutations([0, 1, 2, 3, 4, 5, 6, 7])) {
    for (let x = 0; x < 8; x++) {
      verify(y => permutation[y], 3, 3, x, i * 17 + x + 1);
      summary.targets3++;
    }
    i++;
  }

  const rand = prng(0x5e3c8491);
  for (const bits of [4, 5, 6, 8, 10]) {
    for (let r = 1; r <= Math.min(4, bits - 1); r++) {
      for (let run = 0; run < 12; run++) {
        const incoming = invertibleColumns(bits, rand);
        const outgoing = invertibleColumns(bits, rand);
        const offset = rand() % (2 ** bits);
        const fibreSize = 2 ** r;
        const fibres = Array.from({length: 2 ** (bits - r)}, () => {
          const a = Array.from({length: fibreSize}, (_, j) => j);
          for (let j = fibreSize - 1; j > 0; j--) {
            const k = rand() % (j + 1);
            [a[j], a[k]] = [a[k], a[j]];
          }
          return a;
        });
        /** @param {number} x @returns {number} */
        const oracle = x => {
          const mapped = linear(incoming, x);
          const upper = mapped >>> r;
          const z = ((upper << r) | fibres[upper][mapped & (fibreSize - 1)]) >>> 0;
          return (linear(outgoing, z) ^ offset) >>> 0;
        };
        for (let j = 0; j < 20; j++) {
          const input = rand() % (2 ** bits);
          verify(oracle, bits, r, input, rand());
          summary.hiddenAffineTargets++;
        }
      }
    }
  }

  // Rank <= 5 and interpolation nullity 2: five independent inputs
  // are sent to five distinct outputs contained in a 3-dimensional span.
  const special = new Array(32).fill(-1);
  special[0] = 0;
  for (let j = 0; j < 5; j++) special[2 ** j] = j + 1;
  let fill = 0;
  const used = new Set(special.filter(x => x >= 0));
  for (let j = 0; j < 32; j++) {
    if (special[j] >= 0) continue;
    while (used.has(fill)) fill++;
    special[j] = fill;
    used.add(fill);
  }
  /** @param {number} x @returns {number} */
  const forced = x => ((x & ~31) | special[x & 31]) >>> 0;
  for (let x = 0; x < 64; x++) {
    const v = verify(forced, 6, 5, x, 0x551000 + x);
    assert.equal(v.nullity, 2);
    summary.singularTargets++;
  }

  for (let run = 0; run < 40; run++) {
    const incoming = invertibleColumns(32, rand);
    const outgoing = invertibleColumns(32, rand);
    const offset = rand();
    /** @param {number} x @returns {number} */
    const oracle = x => {
      const mapped = linear(incoming, x);
      const upper = mapped >>> 3;
      const h = diffuse((upper ^ offset) >>> 0);
      const odd = ((h >>> 11) | 1) & 7;
      const shift = h & 7;
      const low = (Math.imul(odd, mapped & 7) + shift) & 7;
      return (linear(outgoing, ((upper << 3) | low) >>> 0) ^ offset) >>> 0;
    };
    for (const x of [0, 1, 0x80000000, 0xffffffff, rand(), rand()]) {
      verify(oracle, 32, 3, x >>> 0, rand());
      summary.width32Targets++;
    }
  }
  process.stdout.write(JSON.stringify(summary) + '\n');
}

if (require.main === module) main();
module.exports = {peerInvert};
