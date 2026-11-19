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

const ATTACKER_COMMIT = 'a800804e69543514c8fd5480a5960ca1dd0ff872';
const SEED = 'heldout-after-a800804e:2026-11-19:agent7:mba-encoded-tables:v1';

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
 * @param {number} xorCount
 * @param {number} rotationCount
 * @returns {{coefficients:number[],xorShifts:number[],cyclicShifts:number[]}}
 */
function randomRound(stream, xorCount, rotationCount) {
  return {
    coefficients: [stream.word(), (stream.word() | 1) >>> 0],
    xorShifts: uniqueShifts(stream, xorCount),
    cyclicShifts: uniqueShifts(stream, rotationCount)
  };
}

/** @param {number[]} values @returns {string} */
function arrayLiteral(values) {
  return '[' + values.map(value => String(value >>> 0)).join(',') + ']';
}

/**
 * @param {number[]} values
 * @param {HashStream} stream
 * @param {'xor'|'add'} mode
 * @returns {{encoded:number[],keys:number[]}}
 */
function encodeValues(values, stream, mode) {
  const keys = values.map(() => stream.word());
  const encoded = values.map((value, index) => mode === 'xor' ?
    ((value >>> 0) ^ keys[index]) >>> 0 :
    ((value >>> 0) + keys[index]) >>> 0);
  return {encoded, keys};
}

/**
 * @param {string} encodedName
 * @param {string} keyName
 * @param {'xor'|'add'} mode
 * @returns {string}
 */
function decodeExpression(encodedName, keyName, mode) {
  if (mode === 'xor') return '(' + encodedName + '[i]^' + keyName + '[i])';
  return '(' + encodedName + '[i]-' + keyName + '[i])';
}

/**
 * @param {Array<{coefficients:number[],xorShifts:number[],cyclicShifts:number[]}>} rounds
 * @param {number} target
 * @param {number} variant
 * @param {HashStream} stream
 * @returns {string}
 */
function sourceFor(rounds, target, variant, stream) {
  const xorCount = rounds[0].xorShifts.length;
  const rotationCount = rounds[0].cyclicShifts.length;
  const addMode = (variant & 1) === 0 ? 'xor' : 'add';
  const mulMode = (variant & 2) === 0 ? 'add' : 'xor';
  const shiftMode = (variant & 4) === 0 ? 'xor' : 'add';
  const rotationMode = (variant & 8) === 0 ? 'add' : 'xor';

  const add = encodeValues(rounds.map(round => round.coefficients[0]), stream, addMode);
  const muls = encodeValues(rounds.map(round => round.coefficients[1]), stream, mulMode);
  const shifts = Array.from({length:xorCount}, (_, column) =>
    encodeValues(rounds.map(round => round.xorShifts[column]), stream, shiftMode)
  );
  const rotations = Array.from({length:rotationCount}, (_, column) =>
    encodeValues(rounds.map(round => round.cyclicShifts[column]), stream, rotationMode)
  );

  const helper = (variant & 16) === 0 ?
    'function rot(v,s){return (((v<<s)|(v>>>(32-s)))>>>0);}' :
    'const rot=(v,s)=>(((v<<s)|(v>>>(32-s)))>>>0);';

  const lines = [
    "'use strict';",
    helper,
    'module.exports=function predicate(input){',
    'const imul=Math.imul;',
    'let x=input>>>0;',
    'const ae=' + arrayLiteral(add.encoded) + ';',
    'const ak=' + arrayLiteral(add.keys) + ';',
    'const me=' + arrayLiteral(muls.encoded) + ';',
    'const mk=' + arrayLiteral(muls.keys) + ';'
  ];

  for (let column = 0; column < shifts.length; column++) {
    lines.push('const se' + column + '=' + arrayLiteral(shifts[column].encoded) + ';');
    lines.push('const sk' + column + '=' + arrayLiteral(shifts[column].keys) + ';');
  }
  for (let column = 0; column < rotations.length; column++) {
    lines.push('const re' + column + '=' + arrayLiteral(rotations[column].encoded) + ';');
    lines.push('const rk' + column + '=' + arrayLiteral(rotations[column].keys) + ';');
  }

  lines.push('for(let i=0;i<ae.length;i++){');
  const addExpression = decodeExpression('ae', 'ak', addMode);
  const mulExpression = decodeExpression('me', 'mk', mulMode);
  const product = (variant & 32) === 0 ?
    'imul(x,' + mulExpression + ')' :
    'imul(' + mulExpression + ',x)';
  lines.push('const p=((' + addExpression + ')^' + product + ')>>>0;');

  /** @type {string[]} */
  let xorTerms = ['p'];
  for (let column = 0; column < shifts.length; column++) {
    const amount = decodeExpression('se' + column, 'sk' + column, shiftMode);
    xorTerms.push('(p>>>' + amount + ')');
  }
  if ((variant & 64) !== 0) xorTerms = xorTerms.reverse();
  lines.push('const q=(' + xorTerms.join('^') + ')>>>0;');

  /** @type {string[]} */
  let rotationTerms = rotations.map((_, column) => {
    const amount = decodeExpression('re' + column, 'rk' + column, rotationMode);
    return 'rot(q,' + amount + ')';
  });
  if ((variant & 128) !== 0) rotationTerms = rotationTerms.reverse();
  lines.push('x=(' + rotationTerms.join('^') + ')>>>0;');
  lines.push('}');

  lines.push((variant & 256) === 0 ?
    'return x===' + String(target >>> 0) + ';' :
    'return ' + String(target >>> 0) + '===x;');
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
function runEncodedHeldoutRecovery() {
  const stream = new HashStream(SEED);
  /** @type {Array<Record<string,unknown>>} */
  const records = [];

  for (let index = 0; index < 32; index++) {
    const roundCount = (index & 1) + 1;
    const xorCount = (index & 2) === 0 ? 1 : 2;
    const rotationCount = (index & 4) === 0 ? 3 : 5;
    const rounds = Array.from(
      {length:roundCount},
      () => randomRound(stream, xorCount, rotationCount)
    );
    const secret = stream.word();
    const target = forwardChain32(secret, rounds);
    const source = sourceFor(rounds, target, index, stream);
    const minified = transformSync(source, {
      loader:'js',
      format:'cjs',
      target:'es2022',
      minify:true,
      legalComments:'none'
    }).code;

    let oldSyntaxRejected = false;
    try {
      recover(minified);
    } catch (error) {
      assert.match(
        String(error),
        /literal round count not found|round parameters not structurally recoverable/
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
      xorCount,
      rotationCount,
      minifiedBytes:Buffer.byteLength(minified),
      recoveryMs,
      oldSyntaxRejected,
      exactParameters:true,
      exactPreimage:true
    });
  }

  return {
    attackerCommit:ATTACKER_COMMIT,
    seed:SEED,
    cases:records.length,
    oneRoundCases:records.filter(record => record.roundCount === 1).length,
    twoRoundCases:records.filter(record => record.roundCount === 2).length,
    oldSyntaxRejections:records.filter(record => record.oldSyntaxRejected === true).length,
    exactParameterRecoveries:records.filter(record => record.exactParameters === true).length,
    exactPreimages:records.filter(record => record.exactPreimage === true).length,
    maxRecoveryMs:Math.max(...records.map(record => Number(record.recoveryMs))),
    records
  };
}

if (require.main === module) {
  console.log(JSON.stringify(runEncodedHeldoutRecovery(), null, 2));
}

module.exports = {ATTACKER_COMMIT, SEED, runEncodedHeldoutRecovery};
