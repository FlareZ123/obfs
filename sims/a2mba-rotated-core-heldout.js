'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const vm = require('node:vm');
const {recoverRotatedCoreSource} = require('./a2mba-rotated-core-static-recover');

const ATTACKER_COMMIT = '2c478bb5e9418cc6ba0c59ef5d963a9cc3cb9614';
const SEED = 'heldout-after-2c478bb5:2026-11-19:agent38:a2mba-rotated-core:v1';

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

  /** @param {number} maximum @returns {number} */
  below(maximum) {
    return this.word() % maximum;
  }

  /** @returns {boolean} */
  bit() {
    return (this.word() & 1) === 1;
  }

  /** @param {string} prefix @returns {string} */
  name(prefix) {
    return prefix + this.word().toString(16).padStart(8, '0');
  }
}

/** @param {string} left @param {string} right @param {boolean} swap @returns {string} */
function commutative(left, right, swap) {
  return swap ? right + '+' + left : left + '+' + right;
}

/**
 * Emit one held-out member of the public rotated-coordinate fixture family.
 * The attacker sees only the returned source string.
 *
 * @param {HashStream} stream
 * @returns {{source:string,rotation:number}}
 */
function emitCase(stream) {
  const rotation = 1 + stream.below(31);
  const back = 32 - rotation;
  const mask = 2 ** rotation - 1;
  const forward = stream.name('f');
  const inverse = stream.name('i');
  const add = stream.name('a');
  const target = stream.name('p');
  const value = stream.name('v');
  const left = stream.name('l');
  const right = stream.name('r');
  const x = stream.name('x');
  const y = stream.name('y');
  const z = stream.name('z');
  const t = stream.name('t');
  const sum = stream.name('s');
  const high = stream.name('h');
  const carry = stream.name('c');
  const upper = stream.name('u');
  const lower = stream.name('d');
  const leafA = stream.name('m');
  const leafB = stream.name('n');
  const leafC = stream.name('o');
  const rotatedA = stream.name('q');
  const rotatedB = stream.name('w');
  const rotatedC = stream.name('e');
  const rotatedY = stream.name('j');
  const first = stream.name('k');
  const second = stream.name('g');
  const third = stream.name('b');

  const forwardTerms = stream.bit()
    ? '(' + value + '>>>' + back + ')|(' + value + '<<' + rotation + ')'
    : '(' + value + '<<' + rotation + ')|(' + value + '>>>' + back + ')';
  const inverseTerms = stream.bit()
    ? '(' + value + '<<' + back + ')|(' + value + '>>>' + rotation + ')'
    : '(' + value + '>>>' + rotation + ')|(' + value + '<<' + back + ')';
  const sumTerms = commutative(left, right, stream.bit());
  const highLeft = '(' + left + '>>>' + rotation + ')';
  const highRight = '(' + right + '>>>' + rotation + ')';
  const highTerms = stream.bit() ? highRight + '+' + highLeft : highLeft + '+' + highRight;
  const lowerTerms = stream.bit() ? carry + '+' + sum : sum + '+' + carry;
  const resultTerms = stream.bit() ? lower + '|' + upper : upper + '|' + lower;

  const helpers = [
    'function ' + forward + '(' + value + '){return ((' + forwardTerms + '))|0;}',
    'function ' + inverse + '(' + value + '){return ((' + inverseTerms + '))|0;}',
    'function ' + add + '(' + left + ',' + right + '){' +
      'const ' + sum + '=(' + sumTerms + ')|0;' +
      'const ' + high + '=(' + highTerms + ')|0;' +
      'const ' + carry + '=' + high + '>>>' + back + ';' +
      'const ' + upper + '=' + high + '<<' + rotation + ';' +
      'const ' + lower + '=(' + lowerTerms + ')&' + mask + ';' +
      'return (' + resultTerms + ')|0;}'
  ];
  const offset = stream.below(helpers.length);
  const ordered = helpers.slice(offset).concat(helpers.slice(0, offset));
  const targetSource = 'function ' + target + '(' + x + ',' + y + ',' + z + ',' + t + '){' +
    'const ' + leafA + '=(' + x + '^' + t + ')|0;' +
    'const ' + leafB + '=(' + z + '&' + t + ')|0;' +
    'const ' + leafC + '=(' + x + '+' + z + ')|0;' +
    'const ' + rotatedA + '=' + forward + '(' + leafA + '),' +
      rotatedB + '=' + forward + '(' + leafB + '),' +
      rotatedC + '=' + forward + '(' + leafC + '),' +
      rotatedY + '=' + forward + '(' + y + ');' +
    'const ' + first + '=' + add + '(' + rotatedA + ',' + rotatedY + ');' +
    'const ' + second + '=' + add + '(' + first + ',' + rotatedB + ');' +
    'const ' + third + '=(' + rotatedC + '|' + rotatedY + ')|0;' +
    'return ' + inverse + '(' + second + '^' + third + ');}';
  return {source: ordered.join('\n') + '\n' + targetSource, rotation};
}

/** @param {number} x @param {number} y @param {number} z @param {number} t @returns {number} */
function nativeRegion32(x, y, z, t) {
  const left = ((((x ^ t) + y) | 0) + (z & t)) | 0;
  const right = ((x + z) | 0) | y;
  return (left ^ right) | 0;
}

/** @returns {{cases:number,exactRecoveries:number,attackerCommit:string,seed:string}} */
function runHeldoutRecovery() {
  const stream = new HashStream(SEED);
  const cases = 32;
  let exactRecoveries = 0;
  for (let index = 0; index < cases; index++) {
    const heldout = emitCase(stream);
    const recovered = recoverRotatedCoreSource(heldout.source);
    assert.equal(recovered.rotation, heldout.rotation);
    const fn = vm.runInNewContext('(' + recovered.recoveredSource + ')');
    let state = stream.word() | 0;
    for (let sample = 0; sample < 2000; sample++) {
      state = (Math.imul(state, 1664525) + 1013904223) | 0;
      const x = state;
      const y = (state ^ sample) | 0;
      const z = Math.imul(state, 3);
      const t = state >>> 9;
      assert.equal(fn(x, y, z, t), nativeRegion32(x, y, z, t));
    }
    exactRecoveries++;
  }
  return {cases, exactRecoveries, attackerCommit: ATTACKER_COMMIT, seed: SEED};
}

function main() {
  console.log(JSON.stringify(runHeldoutRecovery(), null, 2));
}

if (require.main === module) main();

module.exports = {ATTACKER_COMMIT, SEED, HashStream, emitCase, runHeldoutRecovery};
