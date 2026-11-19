'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {test} = require('node:test');
const {transformSync} = require('esbuild');
const {
  forwardChain32,
  inverseChain32
} = require('../sims/mba-author-int32-component-inverse');
const {recoverDataflow} = require('../sims/mba-author-int32-dataflow-recover');

const TABLE_SEED = 'calibration:2026-11-19:agent7:mba-input-indexed-neutral:v1';

/**
 * @param {number} value
 * @returns {number}
 */
function inverseOdd32(value) {
  let inverse = value >>> 0;
  for (let index = 0; index < 5; index++) {
    inverse = Math.imul(inverse, 2 - Math.imul(value, inverse)) >>> 0;
  }
  return inverse;
}

/**
 * @param {string} seed
 * @returns {{multipliers:number[],inverses:number[]}}
 */
function makeTables(seed) {
  const multipliers = [];
  const inverses = [];
  for (let index = 0; index < 32; index++) {
    const word = createHash('sha256')
      .update(seed)
      .update(':')
      .update(String(index))
      .digest()
      .readUInt32LE(0);
    const multiplier = (word | 1) >>> 0;
    const inverse = inverseOdd32(multiplier);
    assert.equal(Math.imul(multiplier, inverse) >>> 0, 1);
    multipliers.push(multiplier);
    inverses.push(inverse);
  }
  return {multipliers, inverses};
}

/**
 * @param {string} source
 * @returns {(input:number)=>boolean}
 */
function loadPredicate(source) {
  /** @type {{exports:unknown}} */
  const moduleObject = {exports: {}};
  const factory = new Function('module', 'exports', source);
  factory(moduleObject, moduleObject.exports);
  return /** @type {(input:number)=>boolean} */ (moduleObject.exports);
}

test('dataflow attacker recovers input-indexed neutral lookup carrier', () => {
  const round = {
    coefficients: [0x91e10da5, 0x6d2b79f5],
    xorShifts: [7, 19],
    cyclicShifts: [3, 11, 23]
  };
  const secret = 47;
  const target = forwardChain32(secret, [round]);
  assert.equal(inverseChain32(target, [round]), secret);

  const tables = makeTables(TABLE_SEED);
  const source = [
    "'use strict';",
    'const rot=(v,s)=>(((v<<s)|(v>>>(32-s)))>>>0);',
    'module.exports=function predicate(input){',
    'const mul=Math.imul;',
    'let x=input>>>0;',
    'const m=[' + tables.multipliers.join(',') + '];',
    'const inv=[' + tables.inverses.join(',') + '];',
    'const p=(' + String(round.coefficients[0] >>> 0) +
      '^mul(' + String(round.coefficients[1] >>> 0) + ',x))>>>0;',
    'const index=input&31;',
    'const mixed=mul(mul(p,m[index]),inv[index])>>>0;',
    'const q=(mixed^(mixed>>>7)^(mixed>>>19))>>>0;',
    'x=(rot(q,3)^rot(q,11)^rot(q,23))>>>0;',
    'return x===' + String(target >>> 0) + ';',
    '};'
  ].join('\n');

  const minified = transformSync(source, {
    loader: 'js',
    format: 'cjs',
    target: 'es2022',
    minify: true,
    legalComments: 'none'
  }).code;

  const predicate = loadPredicate(minified);
  for (let input = 0; input < 512; input++) {
    assert.equal(predicate(input), input === secret);
  }

  const recovered = recoverDataflow(minified);
  assert.equal(recovered.inputIndex, 0);
  assert.equal(recovered.target, target);
  assert.deepEqual(recovered.rounds, [round]);
  assert.equal(inverseChain32(recovered.target, recovered.rounds), secret);
});
