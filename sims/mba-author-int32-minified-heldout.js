'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {transformSync} = require('esbuild');
const {recover} = require('./mba-author-int32-minified-recover');
const {
  forwardChain32,
  inverseChain32
} = require('./mba-author-int32-component-inverse');

const ATTACKER_COMMIT = 'dbe09e3ab6883c0939b2ec89f82841a81c98771d';
const SEED = 'heldout-after-dbe09e3a:2026-11-18:agent6:mba-int32-minified:v1';

class HashStream {
  /** @param {string} seed */
  constructor(seed) {
    this.seed = seed;
    this.counter = 0;
  }

  /** @returns {number} */
  word() {
    return createHash('sha256')
      .update(this.seed)
      .update(':')
      .update(String(this.counter++))
      .digest()
      .readUInt32LE(0);
  }

  /** @param {number} minimum @param {number} maximum @returns {number} */
  integer(minimum, maximum) {
    return minimum + (this.word() % (maximum - minimum + 1));
  }
}

/** @param {HashStream} stream @param {number} count @returns {number[]} */
function shifts(stream, count) {
  return Array.from({length: count}, () => stream.integer(1, 31));
}

/**
 * @param {HashStream} stream
 * @returns {{coefficients:number[],xorShifts:number[],cyclicShifts:number[]}}
 */
function randomRound(stream) {
  return {
    coefficients: [stream.word(), (stream.word() | 1) >>> 0],
    xorShifts: shifts(stream, stream.integer(1, 2)),
    cyclicShifts: shifts(stream, stream.integer(0, 1) === 0 ? 3 : 5)
  };
}

/**
 * @param {{coefficients:number[],xorShifts:number[],cyclicShifts:number[]}} round
 * @param {number} rounds
 * @param {number} target
 * @param {number} variant
 * @returns {string}
 */
function sourceFor(round, rounds, target, variant) {
  const [constant, multiplier] = round.coefficients;
  const product = (variant & 1) === 0 ?
    `Math.imul(${multiplier},x)` :
    `Math.imul(x,${multiplier})`;
  const polynomial = (variant & 2) === 0 ?
    `(${constant}^${product})>>>0` :
    `(${product}^${constant})>>>0`;
  const xorTerms = ['x', ...round.xorShifts.map(shift => `(x>>>${shift})`)].join('^');
  const rotations = round.cyclicShifts.map((shift, index) => {
    const right = 32 - shift;
    return ((variant + index) & 1) === 0 ?
      `((x<<${shift})|(x>>>${right}))` :
      `((x>>>${right})|(x<<${shift}))`;
  }).join('^');
  const comparison = (variant & 1) === 0 ?
    `x===${target}` :
    `${target}===x`;
  return [
    "'use strict';",
    "module.exports=function f(c){",
    "let x=c>>>0;",
    `for(let i=0;i<${rounds};i++){`,
    `x=${polynomial};`,
    `x=(${xorTerms})>>>0;`,
    `x=(${rotations})>>>0;`,
    "}",
    `return ${comparison};`,
    "};"
  ].join('\n');
}

/** @returns {{cases:number,exactParameterRecoveries:number,exactPreimages:number,records:Array<Record<string,unknown>>}} */
function runHeldoutRecovery() {
  const stream = new HashStream(SEED);
  /** @type {Array<Record<string,unknown>>} */
  const records = [];
  for (let index = 0; index < 32; index++) {
    const round = randomRound(stream);
    const rounds = stream.integer(1, 2);
    const secret = stream.word();
    const chain = Array.from({length: rounds}, () => round);
    const target = forwardChain32(secret, chain);
    const source = sourceFor(round, rounds, target, index);
    const minified = transformSync(source, {
      loader: 'js',
      format: 'cjs',
      target: 'es2022',
      minify: true,
      legalComments: 'none'
    }).code;

    const extracted = recover(minified);
    assert.equal(extracted.rounds, rounds);
    assert.deepEqual(extracted.coefficients, round.coefficients);
    assert.deepEqual(extracted.xorShifts, round.xorShifts);
    assert.deepEqual(extracted.cyclicShifts, round.cyclicShifts);
    assert.equal(extracted.target, target);

    const recoveredInput = inverseChain32(
      extracted.target,
      Array.from({length: extracted.rounds}, () => ({
        coefficients: extracted.coefficients,
        xorShifts: extracted.xorShifts,
        cyclicShifts: extracted.cyclicShifts
      }))
    );
    assert.equal(recoveredInput, secret);
    records.push({
      index,
      rounds,
      xorTerms: round.xorShifts.length + 1,
      cyclicTerms: round.cyclicShifts.length,
      minifiedBytes: Buffer.byteLength(minified),
      exactParameters: true,
      exactPreimage: true
    });
  }
  return {
    cases: records.length,
    exactParameterRecoveries: records.filter(record => record.exactParameters === true).length,
    exactPreimages: records.filter(record => record.exactPreimage === true).length,
    records
  };
}

if (require.main === module) {
  console.log(JSON.stringify({
    attackerCommit: ATTACKER_COMMIT,
    seed: SEED,
    ...runHeldoutRecovery()
  }, null, 2));
}

module.exports = {ATTACKER_COMMIT, SEED, runHeldoutRecovery};
