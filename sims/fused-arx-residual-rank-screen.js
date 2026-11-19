'use strict';

const {nativeMix} = require('./fused-arx-batch');

const WIDTH = 128;
const DEFAULT_UNITS = new Uint16Array([0x1234]);

/** @param {number} seed @returns {()=>number} */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** @param {number[]} words @returns {bigint} */
function pack(words) {
  let value = 0n;
  for (let index = 0; index < 4; index += 1) {
    value |= BigInt(words[index] >>> 0) << BigInt(index * 32);
  }
  return value;
}

/** @param {bigint} value @returns {number[]} */
function unpack(value) {
  return Array.from(
    {length: 4},
    (_, index) => Number((value >> BigInt(index * 32)) & 0xffffffffn),
  );
}

/** @param {bigint[]} vectors @returns {number} */
function rank128(vectors) {
  const pivots = Array(WIDTH).fill(0n);
  let rank = 0;
  for (const raw of vectors) {
    let value = raw;
    for (let bit = WIDTH - 1; bit >= 0 && value !== 0n; bit -= 1) {
      if (((value >> BigInt(bit)) & 1n) === 0n) continue;
      if (pivots[bit] !== 0n) value ^= pivots[bit];
      else {
        pivots[bit] = value;
        rank += 1;
        break;
      }
    }
  }
  return rank;
}

/**
 * @param {bigint} state
 * @param {Uint16Array} units
 * @returns {bigint}
 */
function transition(state, units = DEFAULT_UNITS) {
  return pack(nativeMix(unpack(state), units));
}

/**
 * @param {Uint16Array} units
 * @param {number} samples
 * @returns {{units:number[],samples:number,rank:number,checkpoints:Record<string,number>}}
 */
function screen(units = DEFAULT_UNITS, samples = 256) {
  const next = makeRng(0x9e3779b9);
  /** @returns {bigint} */
  const randomState = () => pack(Array.from({length: 4}, () => next()));
  const base = transition(0n, units);
  /** @type {bigint[]} */
  const differences = [];
  /** @type {Record<string,number>} */
  const checkpoints = {};

  for (let index = 1; index <= samples; index += 1) {
    const a = randomState();
    const b = randomState();
    differences.push(
      base
      ^ transition(a, units)
      ^ transition(b, units)
      ^ transition(a ^ b, units),
    );
    if ([32, 64, 96, 128, 160, 192, 224, 256].includes(index)) {
      checkpoints[String(index)] = rank128(differences);
    }
  }

  return {
    units: [...units],
    samples,
    rank: rank128(differences),
    checkpoints,
  };
}

function main() {
  const blocks = [
    new Uint16Array([0x1234]),
    new Uint16Array([0x1234, 0x5678]),
    new Uint16Array([0x1234, 0x5678, 0x9abc]),
    new Uint16Array([0x1234, 0x5678, 0x9abc, 0xdef0]),
  ].map((units) => screen(units));
  process.stdout.write(JSON.stringify({
    candidate: 'fused ARX fixed-block four-word state permutations',
    stateBits: WIDTH,
    oneUnitAnalyticRank: 62,
    twoUnitAnalyticUpperBound: 124,
    blocks,
  }, null, 2) + '\n');
}

if (require.main === module) main();

module.exports = {
  pack,
  rank128,
  screen,
  transition,
  unpack,
};
