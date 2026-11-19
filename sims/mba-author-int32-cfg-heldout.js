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

const ATTACKER_COMMIT = '0bf4a4ff66d90c6a04d11c36e88b8fbbd7433935';
const SEED = 'heldout-after-0bf4a4ff:2026-11-19:agent7:mba-cfg:v1';

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
  const xorCount = stream.integer(1, 2);
  const rotationCount = stream.integer(0, 1) === 0 ? 3 : 5;
  return {
    coefficients: [stream.word(), (stream.word() | 1) >>> 0],
    xorShifts: uniqueShifts(stream, xorCount),
    cyclicShifts: uniqueShifts(stream, rotationCount)
  };
}

/**
 * @param {HashStream} stream
 * @param {number} count
 * @returns {number[]}
 */
function uniqueStates(stream, count) {
  const values = new Set();
  while (values.size < count) values.add(stream.integer(2, 0x7fff));
  return [...values];
}

/**
 * @param {string[]} values
 * @param {number} variant
 * @returns {string[]}
 */
function reorder(values, variant) {
  if ((variant & 1) !== 0) return [...values].reverse();
  if (values.length < 2) return [...values];
  const shift = variant % values.length;
  return [...values.slice(shift), ...values.slice(0, shift)];
}

/**
 * @param {Array<{coefficients:number[],xorShifts:number[],cyclicShifts:number[]}>} rounds
 * @param {number} target
 * @param {number} variant
 * @param {HashStream} stream
 * @returns {string}
 */
function sourceFor(rounds, target, variant, stream) {
  const states = uniqueStates(stream, rounds.length + 2);
  const roundStates = states.slice(0, rounds.length);
  const doneState = states[rounds.length];
  const deadState = states[rounds.length + 1];
  const helper = (variant & 1) === 0 ?
    'function rot(v,s){return (((v<<s)|(v>>>(32-s)))>>>0);}' :
    'const rot=(v,s)=>(((v<<s)|(v>>>(32-s)))>>>0);';

  /** @type {string[]} */
  const cases = [];
  for (let index = 0; index < rounds.length; index++) {
    const round = rounds[index];
    const split = stream.word();
    const other = (round.coefficients[0] ^ split) >>> 0;
    const nextState = index + 1 < rounds.length ? roundStates[index + 1] : doneState;
    const product = ((variant + index) & 1) === 0 ?
      `mul(x,${round.coefficients[1]})` :
      `mul(${round.coefficients[1]},x)`;
    const polynomial = ((variant + index) & 2) === 0 ?
      `${split}^${product}^${other}` :
      `${other}^${split}^${product}`;

    let xorTerms = [`p${index}`];
    for (const shift of round.xorShifts) {
      xorTerms.push(`(p${index}>>>${shift})`);
    }
    if (((variant + index) & 4) !== 0) xorTerms = xorTerms.reverse();

    let rotations = round.cyclicShifts.map(
      shift => `rot(q${index},${shift})`
    );
    if (((variant + index) & 8) !== 0) rotations = rotations.reverse();

    cases.push([
      `case ${roundStates[index]}:`,
      `const p${index}=(${polynomial})>>>0;`,
      `const q${index}=(${xorTerms.join('^')})>>>0;`,
      `x=(${rotations.join('^')})>>>0;`,
      `state=${nextState};break;`
    ].join(''));
  }

  cases.push([
    `case ${deadState}:`,
    'x=Math.sin(x);',
    `state=${doneState};break;`
  ].join(''));

  const condition = (variant & 16) === 0 ?
    `state!==${doneState}` :
    `state!=${doneState}`;

  const lines = [
    "'use strict';",
    helper,
    'module.exports=function predicate(input){',
    'const mul=Math.imul;',
    `let x=input>>>0,state=${roundStates[0]};`,
    `while(${condition}){`,
    'switch(state){',
    ...reorder(cases, variant),
    'default:',
    `state=${doneState};break;`,
    '}',
    '}',
    (variant & 1) === 0 ?
      `return x===${target >>> 0};` :
      `return ${target >>> 0}===x;`,
    '};'
  ];
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
function runCfgHeldoutRecovery() {
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
      assert.match(
        String(error),
        /author-style loop or target not found|round bound not found|literal round count not found|round parameters not structurally recoverable/
      );
      oldSyntaxRejected = true;
    }
    assert.equal(oldSyntaxRejected, true);

    const started = performance.now();
    const extracted = recoverDataflow(minified);
    const recoveryMs = performance.now() - started;

    assert.equal(extracted.inputIndex, 0);
    assert.equal(extracted.target, target);
    assert.deepEqual(extracted.rounds, rounds);
    assert.equal(inverseChain32(extracted.target, extracted.rounds), secret);

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
  console.log(JSON.stringify(runCfgHeldoutRecovery(), null, 2));
}

module.exports = {ATTACKER_COMMIT, SEED, runCfgHeldoutRecovery};
