'use strict';

const {
  optimizedTransform32,
} = require('./mba-author-int32-heldout');

/** @param {number} value @returns {number} */
function u32(value) {
  return value >>> 0;
}

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

/** @param {number[]} vectors @returns {number} */
function rank32(vectors) {
  const pivots = Array(32).fill(0);
  let rank = 0;
  for (const raw of vectors) {
    let value = raw >>> 0;
    for (let bit = 31; bit >= 0 && value !== 0; bit -= 1) {
      if (((value >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) {
        value = u32(value ^ pivots[bit]);
      } else {
        pivots[bit] = value;
        rank += 1;
        break;
      }
    }
  }
  return rank;
}

/**
 * @param {number} rounds
 * @param {number} samples
 * @returns {{rounds:number,samples:number,rank:number,checkpoints:Record<string,number>}}
 */
function screen(rounds, samples = 128) {
  const next = makeRng(u32(0x9e3779b9 ^ rounds));
  const base = optimizedTransform32(0, rounds);
  /** @type {number[]} */
  const differences = [];
  /** @type {Record<string,number>} */
  const checkpoints = {};

  for (let index = 1; index <= samples; index += 1) {
    const a = next();
    const b = next();
    differences.push(u32(
      base
      ^ optimizedTransform32(a, rounds)
      ^ optimizedTransform32(b, rounds)
      ^ optimizedTransform32(u32(a ^ b), rounds),
    ));
    if ([16, 32, 48, 64, 96, 128].includes(index)) {
      checkpoints[String(index)] = rank32(differences);
    }
  }

  return {
    rounds,
    samples,
    rank: rank32(differences),
    checkpoints,
  };
}

function main() {
  const records = [1, 2, 4].map((rounds) => screen(rounds));
  process.stdout.write(JSON.stringify({
    candidate: 'mba-author-int32 optimizedTransform32',
    secondDifferenceSamples: 128,
    records,
  }, null, 2) + '\n');
}

if (require.main === module) main();

module.exports = {
  makeRng,
  rank32,
  screen,
};
