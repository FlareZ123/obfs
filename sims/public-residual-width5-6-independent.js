'use strict';

const assert = require('node:assert/strict');

/** @typedef {{queries:number, repairs:number, expansions:number, recovered:number}} AuditResult */

/** @param {number[]} columns @param {number} x @returns {number} */
function apply(columns, x) {
  let result = 0;
  for (let bit = 0; bit < columns.length; bit++) {
    if (x & (1 << bit)) result ^= columns[bit];
  }
  return result;
}

/** @param {number[]} vectors @returns {Set<number>} */
function span(vectors) {
  const values = new Set([0]);
  for (const v of vectors) for (const x of [...values]) values.add(x ^ v);
  return values;
}

/** @param {number[]} columns @returns {number[]} */
function kernel(columns) {
  const result = [];
  for (let x = 0; x < (1 << columns.length); x++) {
    if (apply(columns, x) === 0) result.push(x);
  }
  return result;
}

/** @param {number[]} columns @param {number} target @returns {number|null} */
function preimage(columns, target) {
  for (let x = 0; x < (1 << columns.length); x++) {
    if (apply(columns, x) === target) return x;
  }
  return null;
}

/** @param {number} seed @returns {() => number} */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** @param {number} width @param {() => number} rng @returns {number[]} */
function randomLinear(width, rng) {
  const limit = 1 << width;
  for (;;) {
    const columns = Array.from({length:width}, () => rng() % limit);
    if (kernel(columns).length === 1) return columns;
  }
}

/** @param {number} size @param {() => number} rng @returns {number[]} */
function permutation(size, rng) {
  const data = Array.from({length:size}, (_, i) => i);
  for (let i = size - 1; i > 0; i--) {
    const j = rng() % (i + 1);
    [data[i], data[j]] = [data[j], data[i]];
  }
  return data;
}

/**
 * Brute-force reference verifier intentionally uses neither Gaussian
 * elimination nor the production oracle-inverter implementation.
 * @param {number[]} values A complete, private oracle truth table
 * @param {number} target A chosen output; not charged as an oracle query
 * @returns {AuditResult}
 */
function invert(values, target) {
  const width = Math.log2(values.length);
  assert.equal(Number.isInteger(width), true);
  const cache = new Map();
  /** @param {number} x @returns {number} */
  function query(x) {
    if (!cache.has(x)) cache.set(x, values[x]);
    return /** @type {number} */ (cache.get(x));
  }
  const constant = query(0);
  let columns = Array.from({length:width}, (_,bit) => query(1 << bit) ^ constant);
  let repairs = 0;
  let expansions = 0;
  for (;;) {
    const ker = kernel(columns);
    if (ker.length === 1) break;
    let holder = span(ker);
    let repaired = false;
    for (;;) {
      let expanded = false;
      const image = span(columns);
      for (const v of [...holder].sort((a,b) => a-b)) {
        if (v === 0) continue;
        const delta = query(v) ^ constant;
        if (!image.has(delta)) {
          const q = /** @type {number} */ (ker.find(x => x !== 0));
          const bit = Math.floor(Math.log2(q & -q));
          const next = [...columns];
          next[bit] ^= delta;
          assert.equal(kernel(next).length * 2, ker.length);
          columns = next;
          repairs++;
          repaired = true;
          break;
        }
        const x = preimage(columns, delta);
        assert.notEqual(x, null);
        const p = /** @type {number} */ (x);
        if (!holder.has(p)) {
          holder = span([...holder, p]);
          expansions++;
          expanded = true;
          break;
        }
      }
      if (repaired) break;
      assert.ok(expanded, 'singular surrogate stalled');
    }
  }

  const initial = preimage(columns, target ^ constant);
  assert.notEqual(initial, null);
  const first = /** @type {number} */ (initial);
  let cursor = first;
  for (let step = 0; step < values.length; step++) {
    const next = preimage(columns, query(cursor) ^ constant);
    assert.notEqual(next, null);
    if (next === first) {
      return {queries:cache.size, repairs, expansions, recovered:cursor};
    }
    cursor = /** @type {number} */ (next);
  }
  throw new Error('orbit did not close');
}

/**
 * @param {number[]} values
 * @returns {{r:number, singular:boolean}}
 */
function verifyStructure(values) {
  const width = Math.log2(values.length);
  const constant = values[0];
  const columns = Array.from({length:width}, (_,i) => values[1 << i] ^ constant);
  const residuals = values.map((v,i) => v ^ constant ^ apply(columns,i));
  const residualSpace = span(residuals);
  const secondDifferences = [];
  for (let a = 0; a < values.length; a++) {
    for (let b = 0; b < values.length; b++) {
      secondDifferences.push(values[0] ^ values[a] ^ values[b] ^ values[a ^ b]);
    }
  }
  assert.deepEqual(span(secondDifferences), residualSpace);
  const inputNonlinear = [];
  for (let x = 0; x < values.length; x++) {
    if (residualSpace.has(apply(columns,x))) inputNonlinear.push(x);
  }
  assert.equal(inputNonlinear.length, residualSpace.size);
  const inverse = Array(values.length).fill(-1);
  for (let x = 0; x < values.length; x++) inverse[values[x]] = x;
  assert.ok(inverse.every(v => v >= 0));
  const ic = inverse[0];
  const icol = Array.from({length:width}, (_,i) => inverse[1 << i] ^ ic);
  const inverseResidual = span(inverse.map((v,i) => v ^ ic ^ apply(icol,i)));
  assert.deepEqual(inverseResidual, new Set(inputNonlinear));
  return {r:Math.log2(residualSpace.size), singular:kernel(columns).length > 1};
}

/** @param {boolean} [quiet] */
function run(quiet = false) {
  const rng = random(0x8a11d065);
  const configurations = [
    {width:5,cases:240,kind:'structured'},
    {width:6,cases:160,kind:'structured'},
    {width:5,cases:160,kind:'arbitrary'},
    {width:6,cases:96,kind:'arbitrary'}
  ];
  let cases = 0;
  let targets = 0;
  let initiallySingular = 0;
  let maxQueries = 0;
  let maxRepairs = 0;
  let maxExpansions = 0;
  const ranks = new Map();
  for (const {width, cases:count, kind} of configurations) {
    const size = 1 << width;
    for (let i = 0; i < count; i++) {
      const input = randomLinear(width,rng);
      const output = randomLinear(width,rng);
      const innerLow = permutation(8,rng);
      const innerHigh = width===6 ? permutation(8,rng) : null;
      const a = rng() % size;
      const b = rng() % size;
      const base = kind==='arbitrary' ? permutation(size,rng) :
        Array.from({length:size}, (_,x) => {
          const low = innerLow[x & 7];
          const high = innerHigh ? innerHigh[x >>> 3] << 3 : x & ~7;
          return low | high;
        });
      const values = Array.from({length:size}, (_,x) =>
        apply(output,base[apply(input,x) ^ a]) ^ b);
      assert.equal(new Set(values).size,size);
      const {r:baseRank} = verifyStructure(base);
      const {r,singular} = verifyStructure(values);
      assert.equal(r,baseRank,'affine wrapper changed intrinsic residual rank');
      if (singular) initiallySingular++;
      const rankKey = width+':'+r;
      ranks.set(rankKey,(ranks.get(rankKey)??0)+1);
      for (let original = 0; original < size; original++) {
        const result = invert(values,values[original]);
        assert.equal(result.recovered,original);
        assert.ok(result.queries <= width + 2**(r+1),'query bound: r='+r);
        maxQueries = Math.max(maxQueries,result.queries);
        maxRepairs = Math.max(maxRepairs,result.repairs);
        maxExpansions = Math.max(maxExpansions,result.expansions);
        targets++;
      }
      cases++;
    }
  }
  const summary = {seed:'0x8a11d065',cases,targets,initiallySingular,
    ranks:Object.fromEntries([...ranks].sort((a,b)=>a[0]-b[0])),
    maxQueries,maxRepairs,maxExpansions};
  if (!quiet) process.stdout.write(JSON.stringify(summary,null,2)+'\n');
  return summary;
}

if (require.main === module) run();
module.exports = {run};
