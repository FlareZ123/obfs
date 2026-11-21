'use strict';

const assert = require('node:assert/strict');
const {peerInvert} = require('./affine-low-rank-peer-check');
const {invertPublicResidual32} = require('./public-affine-residual-target-inverter32');

/** @param {number} seed @returns {()=>number} */
function rng(seed) {
  let x = (seed >>> 0) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
}

/** @param {number[]} columns @param {number} input @returns {number} */
function linear(columns, input) {
  let output = 0;
  for (let bit = 0; bit < columns.length; bit++) {
    if ((input >>> bit) & 1) output = (output ^ columns[bit]) >>> 0;
  }
  return output;
}

/** @param {()=>number} random @returns {number[]} */
function matrix(random) {
  const columns = Array.from({length: 32}, (_, bit) => (2 ** bit) >>> 0);
  for (let step = 0; step < 512; step++) {
    const i = random() % 32;
    const j = (i + 1 + random() % 31) % 32;
    columns[i] = (columns[i] ^ columns[j]) >>> 0;
  }
  return columns;
}

/** @param {number} input @returns {number} */
function mix(input) {
  let x = input >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** @param {number} rank @returns {number[]} */
function singularFibre(rank) {
  const size = 2 ** rank;
  const result = Array(size).fill(-1);
  result[0] = 0;
  // For rank 3, span(1,2,3) has rank 2.
  // For rank 5, span(1,2,3,4,5) has rank 3.
  for (let bit = 0; bit < rank; bit++) {
    result[2 ** bit] = bit + 1;
  }
  const used = new Set(result.filter(value => value >= 0));
  let next = 0;
  for (let i = 0; i < size; i++) {
    if (result[i] >= 0) continue;
    while (used.has(next)) next++;
    result[i] = next;
    used.add(next);
  }
  assert.equal(new Set(result).size, size);
  return result;
}

/**
 * A hidden affine conjugate of an output-rank-limited, fiberwise bijection.
 * For the singular arm, input is identity and the lower basis images are
 * deliberately dependent; the output map is independently mixed.
 * @param {number} rank
 * @param {number} seed
 * @param {boolean} singular
 * @returns {(input:number)=>number}
 */
function oracleFamily(rank, seed, singular) {
  const random = rng(seed);
  const incoming = singular ? Array.from({length: 32}, (_, i) => (2 ** i) >>> 0) : matrix(random);
  const outgoing = matrix(random);
  const offset = random();
  const mask = 2 ** rank - 1;
  const table = singular ? singularFibre(rank) : [];
  return input => {
    const x = linear(incoming, input);
    const upper = x >>> rank;
    const lower = x & mask;
    const control = mix((upper ^ offset) >>> 0);
    let changed;
    if (singular) {
      // Independent translation by upper is bijective on every fiber.
      changed = (table[lower] ^ (control & mask)) & mask;
    } else {
      const odd = ((control >>> 13) | 1) & mask;
      changed = (Math.imul(odd, lower) + (control & mask)) & mask;
    }
    const combined = (((upper << rank) >>> 0) | changed) >>> 0;
    return (linear(outgoing, combined) ^ offset) >>> 0;
  };
}

/** @typedef {{family:string,rank:number,targets:number,nullityMin:number,nullityMax:number,peerSum:number,publicSum:number,peerMax:number,publicMax:number,peerWins:number,publicWins:number,ties:number}} Row */

/** @param {number} rank @param {boolean} singular @returns {Row} */
function evaluate(rank, singular) {
  const family = singular ? 'singular' : 'mixed';
  /** @type {Row} */
  const row = {
    family, rank, targets: 0, nullityMin: 32, nullityMax: 0,
    peerSum: 0, publicSum: 0, peerMax: 0, publicMax: 0,
    peerWins: 0, publicWins: 0, ties: 0
  };
  const random = rng(0x31a69b73 ^ (rank << 15) ^ (singular ? 1 : 0));
  for (let instance = 0; instance < 12; instance++) {
    const oracle = oracleFamily(rank, random(), singular);
    for (let sample = 0; sample < 8; sample++) {
      // Avoid conflating basis-query target hits with inversion difficulty.
      const input = (random() | 0x3a6c8800) >>> 0;
      const target = oracle(input);
      const peerSeen = new Set();
      const peer = peerInvert(x => {
        peerSeen.add(x >>> 0);
        return oracle(x);
      }, 32, rank, target, rng(random()));
      const publicSeen = new Set();
      const existing = invertPublicResidual32(x => {
        publicSeen.add(x >>> 0);
        return oracle(x);
      }, target, {seed: random(), maxQueries: 2000, maxSubspaceDimension: 16});
      assert.equal(peer.preimage, input);
      assert.equal(existing.value, input);
      assert.equal(oracle(peer.preimage), target);
      assert.equal(oracle(existing.value), target);
      assert.equal(existing.queries, publicSeen.size);
      assert.ok(peerSeen.size <= 33 + 32 + 2 ** rank);
      const a = peerSeen.size;
      const b = publicSeen.size;
      row.targets++;
      row.nullityMin = Math.min(row.nullityMin, peer.nullity);
      row.nullityMax = Math.max(row.nullityMax, peer.nullity);
      row.peerSum += a;
      row.publicSum += b;
      row.peerMax = Math.max(row.peerMax, a);
      row.publicMax = Math.max(row.publicMax, b);
      if (a < b) row.peerWins++;
      else if (b < a) row.publicWins++;
      else row.ties++;
    }
  }
  return row;
}

function main() {
  /** @type {Row[]} */
  const rows = [];
  for (const rank of [1, 2, 3, 5, 8]) rows.push(evaluate(rank, false));
  for (const rank of [3, 5]) rows.push(evaluate(rank, true));
  assert.equal(rows.reduce((sum, row) => sum + row.targets, 0), 672);
  for (const row of rows) {
    if (row.family === 'singular') {
      assert.equal(row.nullityMin, row.rank === 3 ? 1 : 2);
      assert.equal(row.nullityMax, row.nullityMin);
    }
  }
  process.stdout.write(JSON.stringify({scope:'source-matched 32-bit forward-oracle distinct-query comparison', rows}) + '\n');
}

if (require.main === module) main();
module.exports = {evaluate};
