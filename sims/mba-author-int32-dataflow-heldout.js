'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {transformSync} = require('esbuild');
const {recover} = require('./mba-author-int32-minified-recover');
const {recoverDataflow} = require('./mba-author-int32-dataflow-recover');
const {
  forwardChain32,
  inverseChain32
} = require('./mba-author-int32-component-inverse');

const ATTACKER_COMMIT = '9fc2557db97596e0513e4900609a75df5d4af3f1';
const SEED = 'heldout-after-9fc2557d:2026-11-19:agent7:mba-dataflow:v1';

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

/**
 * @param {HashStream} stream
 * @param {number} count
 * @returns {number[]}
 */
function uniqueShifts(stream, count) {
  const values = new Set();
  while (values.size < count) values.add(stream.integer(1, 31));
  return [...values].sort((a, b) => a - b);
}

/**
 * @param {HashStream} stream
 * @returns {{coefficients:number[],xorShifts:number[],cyclicShifts:number[]}}
 */
function randomRound(stream) {
  return {
    coefficients: [stream.word(), (stream.word() | 1) >>> 0],
    xorShifts: uniqueShifts(stream, stream.integer(1, 2)),
    cyclicShifts: uniqueShifts(stream, stream.integer(0, 1) === 0 ? 3 : 5)
  };
}

/** @param {string[]} values @param {number} offset @returns {string[]} */
function rotated(values, offset) {
  if (values.length === 0) return [];
  const start = offset % values.length;
  return [...values.slice(start), ...values.slice(0, start)];
}

/**
 * @param {Array<{coefficients:number[],xorShifts:number[],cyclicShifts:number[]}>} rounds
 * @param {number} target
 * @param {number} variant
 * @param {HashStream} stream
 * @returns {string}
 */
function sourceFor(rounds, target, variant, stream) {
  const helper = (variant & 1) === 0 ?
    'function rot(v,s){return (((v<<s)|(v>>>(32-s)))>>>0);}' :
    'const rot=(v,s)=>(((v<<s)|(v>>>(32-s)))>>>0);';
  const lines = [
    "'use strict';",
    helper,
    'module.exports=function predicate(input){',
    'const mul=Math.imul;',
    'let x=input>>>0;'
  ];

  for (let index = 0; index < rounds.length; index++) {
    const round = rounds[index];
    const [constant, multiplier] = round.coefficients;
    const splitA = stream.word();
    const splitB = (constant ^ splitA) >>> 0;
    const junkShift = stream.integer(1, 31);
    const p = `p${index}`;
    const junk = `j${index}`;
    const mixed = `s${index}`;
    const product = ((variant + index) & 1) === 0 ?
      `mul(x,${multiplier})` :
      `mul(${multiplier},x)`;
    const polynomial = rotated([
      String(splitA),
      product,
      String(splitB)
    ], variant + index).join('^');

    lines.push(`const ${p}=(${polynomial})>>>0;`);
    lines.push(`const ${junk}=${p}>>>${junkShift};`);

    const xorTerms = [
      p,
      ...round.xorShifts.map(shift => `(${p}>>>${shift})`),
      junk,
      junk
    ];
    lines.push(
      `const ${mixed}=(${rotated(xorTerms, variant + index).join('^')})>>>0;`
    );

    let rotations = round.cyclicShifts.map(shift => `rot(${mixed},${shift})`);
    if (((variant + index) & 1) !== 0) rotations = rotations.reverse();
    else rotations = rotated(rotations, index + 1);
    lines.push(`x=(${rotations.join('^')})>>>0;`);
  }

  lines.push((variant & 2) === 0 ?
    `return x===${target};` :
    `return ${target}===x;`);
  lines.push('};');
  return lines.join('\n');
}

/**
 * @returns {{
 *   attackerCommit:string,
 *   seed:string,
 *   cases:number,
 *   oneRoundCases:number,
 *   twoRoundCases:number,
 *   oldSyntaxRejections:number,
 *   exactParameterRecoveries:number,
 *   exactPreimages:number,
 *   maxRecoveryMs:number,
 *   records:Array<Record<string,unknown>>
 * }}
 */
function runHeldoutRecovery() {
  const stream = new HashStream(SEED);
  /** @type {Array<Record<string,unknown>>} */
  const records = [];

  for (let index = 0; index < 32; index++) {
    const roundCount = (index & 1) + 1;
    const rounds = Array.from({length: roundCount}, () => randomRound(stream));
    const secret = stream.word();
    const target = forwardChain32(secret, rounds);
    const source = sourceFor(rounds, target, index, stream);
    const minified = transformSync(source, {
      loader: 'js',
      format: 'cjs',
      target: 'es2022',
      minify: true,
      legalComments: 'none'
    }).code;

    let oldSyntaxRejected = false;
    try {
      recover(minified);
    } catch (error) {
      assert.match(String(error), /author-style loop or target not found/);
      oldSyntaxRejected = true;
    }
    assert.equal(oldSyntaxRejected, true);

    const started = performance.now();
    const extracted = recoverDataflow(minified);
    const recoveryMs = performance.now() - started;

    assert.equal(extracted.inputIndex, 0);
    assert.equal(extracted.target, target);
    assert.deepEqual(extracted.rounds, rounds);

    const recoveredInput = inverseChain32(extracted.target, extracted.rounds);
    assert.equal(recoveredInput, secret);

    records.push({
      index,
      roundCount,
      xorShiftCounts: rounds.map(round => round.xorShifts.length),
      cyclicShiftCounts: rounds.map(round => round.cyclicShifts.length),
      minifiedBytes: Buffer.byteLength(minified),
      recoveryMs,
      oldSyntaxRejected,
      exactParameters: true,
      exactPreimage: true
    });
  }

  return {
    attackerCommit: ATTACKER_COMMIT,
    seed: SEED,
    cases: records.length,
    oneRoundCases: records.filter(record => record.roundCount === 1).length,
    twoRoundCases: records.filter(record => record.roundCount === 2).length,
    oldSyntaxRejections: records.filter(record => record.oldSyntaxRejected === true).length,
    exactParameterRecoveries: records.filter(record => record.exactParameters === true).length,
    exactPreimages: records.filter(record => record.exactPreimage === true).length,
    maxRecoveryMs: Math.max(...records.map(record => Number(record.recoveryMs))),
    records
  };
}

if (require.main === module) {
  console.log(JSON.stringify(runHeldoutRecovery(), null, 2));
}

module.exports = {ATTACKER_COMMIT, SEED, runHeldoutRecovery};
