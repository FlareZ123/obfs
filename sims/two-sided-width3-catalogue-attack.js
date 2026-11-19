'use strict';

const WIDTH = 3;
const SIZE = 1 << WIDTH;
const INITIAL = [0, 1, 2, 4];
const DIAGNOSTICS = [3, 5, 6, 7];

/** @param {number[]} permutation @returns {number} */
function encode(permutation) {
  let code = 0;
  for (let x = 0; x < SIZE; x += 1) code |= permutation[x] << (WIDTH * x);
  return code >>> 0;
}

/** @param {number} code @param {number} x @returns {number} */
function at(code, x) {
  return (code >>> (WIDTH * x)) & (SIZE - 1);
}

/** @param {number[]} vectors @returns {number} */
function rank(vectors) {
  const basis = Array(WIDTH).fill(0);
  let result = 0;
  for (const raw of vectors) {
    let value = raw;
    for (let bit = WIDTH - 1; bit >= 0 && value !== 0; bit -= 1) {
      if (((value >>> bit) & 1) === 0) continue;
      if (basis[bit] !== 0) value ^= basis[bit];
      else {
        basis[bit] = value;
        result += 1;
        break;
      }
    }
  }
  return result;
}

/** @returns {number[][]} */
function linearMaps() {
  const maps = [];
  for (let a = 1; a < SIZE; a += 1) {
    for (let b = 1; b < SIZE; b += 1) {
      for (let c = 1; c < SIZE; c += 1) {
        const columns = [a, b, c];
        if (rank(columns) !== WIDTH) continue;
        maps.push(Array.from({length: SIZE}, (_, x) => {
          let y = 0;
          for (let bit = 0; bit < WIDTH; bit += 1) {
            if (((x >>> bit) & 1) !== 0) y ^= columns[bit];
          }
          return y;
        }));
      }
    }
  }
  return maps;
}

/** @returns {number[][]} */
function compatiblePermutations() {
  const offsets = [0, 1, 3];
  const maps = [];
  for (let code = 0; code < 128; code += 1) {
    maps.push(Array.from({length: SIZE}, (_, x) => {
      let y = 0;
      for (let bit = 0; bit < WIDTH; bit += 1) {
        const lower = x & ((1 << bit) - 1);
        const flip = (code >>> (offsets[bit] + lower)) & 1;
        y |= ((((x >>> bit) & 1) ^ flip) << bit);
      }
      return y;
    }));
  }
  return maps;
}

/** @returns {number[]} */
function twoSidedFamily() {
  const linear = linearMaps();
  const compatible = compatiblePermutations();
  const family = new Set();
  for (const inner of linear) {
    for (const permutation of compatible) {
      const middle = Array.from({length: SIZE}, (_, x) => permutation[inner[x]]);
      for (const outer of linear) {
        family.add(encode(Array.from({length: SIZE}, (_, x) => outer[middle[x]])));
      }
    }
  }
  return [...family];
}

/** @param {number} code @param {number} target @returns {number} */
function preimage(code, target) {
  for (let x = 0; x < SIZE; x += 1) {
    if (at(code, x) === target) return x;
  }
  throw new Error('missing preimage');
}

/** @param {number} code @returns {number} */
function initialTranscript(code) {
  let key = 0;
  for (let index = 0; index < INITIAL.length; index += 1) {
    key |= at(code, INITIAL[index]) << (WIDTH * index);
  }
  return key;
}

function main() {
  const started = Date.now();
  const family = twoSidedFamily();
  if (family.length !== 10752) throw new Error(`family size ${family.length}`);

  /** @type {Map<number,number[]>} */
  const groups = new Map();
  for (const code of family) {
    const key = initialTranscript(code);
    const prior = groups.get(key);
    if (prior) prior.push(code);
    else groups.set(key, [code]);
  }
  if (groups.size !== 1680) throw new Error(`transcript count ${groups.size}`);

  let maxGroup = 0;
  const targetRows = [];
  for (let target = 0; target < SIZE; target += 1) {
    /** @type {Map<string,number>} */
    const counts = new Map();
    for (const codes of groups.values()) {
      maxGroup = Math.max(maxGroup, codes.length);
      const first = preimage(codes[0], target);
      if (codes.every((code) => preimage(code, target) === first)) {
        counts.set('none', (counts.get('none') || 0) + 1);
        continue;
      }

      let selected = -1;
      for (const x of DIAGNOSTICS) {
        /** @type {Map<number,number>} */
        const seen = new Map();
        let valid = true;
        for (const code of codes) {
          const output = at(code, x);
          const candidate = preimage(code, target);
          const prior = seen.get(output);
          if (prior === undefined) seen.set(output, candidate);
          else if (prior !== candidate) {
            valid = false;
            break;
          }
        }
        if (valid) {
          selected = x;
          break;
        }
      }
      if (selected < 0) throw new Error(`no one-query diagnostic for target ${target}`);
      counts.set(String(selected), (counts.get(String(selected)) || 0) + 1);
    }
    targetRows.push({
      target,
      diagnostics: Object.fromEntries([...counts].sort()),
    });
  }

  console.log(JSON.stringify({
    width: WIDTH,
    compatiblePermutations: 128,
    invertibleLinearMaps: 168,
    distinctTwoSidedPermutations: family.length,
    initialQueries: INITIAL,
    initialTranscriptClasses: groups.size,
    maxFunctionsPerInitialTranscript: maxGroup,
    maximumChosenQueriesPerTarget: 5,
    targetsChecked: SIZE,
    targetRows,
    elapsedMs: Date.now() - started,
    scope: 'complete width-3 model; catalogue attack, no large-width extrapolation',
  }, null, 2));
}

if (require.main === module) main();

module.exports = {twoSidedFamily};
