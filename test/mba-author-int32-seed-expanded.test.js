'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {transformSync} = require('esbuild');
const {recover} = require('../sims/mba-author-int32-minified-recover');
const {recoverDataflow} = require('../sims/mba-author-int32-dataflow-recover');
const {forwardChain32} = require('../sims/mba-author-int32-component-inverse');

/**
 * @param {number} state
 * @param {number} multiplier
 * @param {number} increment
 * @returns {number}
 */
function step(state, multiplier, increment) {
  return (Math.imul(state, multiplier) + increment) >>> 0;
}

/**
 * @param {number} seed
 * @param {number} roundCount
 * @param {number} xorCount
 * @param {number} rotationCount
 * @param {number} lcgMultiplier
 * @param {number} increment
 * @returns {Array<{coefficients:number[],xorShifts:number[],cyclicShifts:number[]}>}
 */
function expandRounds(seed, roundCount, xorCount, rotationCount, lcgMultiplier, increment) {
  let state = seed >>> 0;
  const rounds = [];
  for (let index = 0; index < roundCount; index++) {
    state = step(state, lcgMultiplier, increment);
    const additive = state;
    state = step(state, lcgMultiplier, increment);
    const multiplier = (state * 2 + 1) >>> 0;
    state = step(state, lcgMultiplier, increment);
    const shiftBase = (state >>> 28) + 1;
    state = step(state, lcgMultiplier, increment);
    const rotationBase = (state >>> 30) + 1;
    rounds.push({
      coefficients:[additive, multiplier],
      xorShifts:xorCount === 1 ? [shiftBase] : [shiftBase, shiftBase + 15],
      cyclicShifts:rotationCount === 3 ?
        [rotationBase, rotationBase + 5, rotationBase + 11] :
        [rotationBase, rotationBase + 5, rotationBase + 11,
          rotationBase + 17, rotationBase + 23]
    });
  }
  return rounds;
}

test('frozen dataflow attacker partially executes public LCG round expansion', () => {
  const seed = 0x6a09e667;
  const lcgMultiplier = 1664525;
  const increment = 1013904223;
  const rounds = expandRounds(seed, 2, 2, 5, lcgMultiplier, increment);
  const secret = 197;
  const target = forwardChain32(secret, rounds);

  const source = [
    "'use strict';",
    'const rot=(v,s)=>(((v<<s)|(v>>>(32-s)))>>>0);',
    'module.exports=function predicate(input){',
    'const mul=Math.imul;',
    'let x=input>>>0;',
    'let s=' + String(seed >>> 0) + ';',
    'for(let i=0;i<2;i++){',
    's=(mul(s,' + String(lcgMultiplier) + ')+' + String(increment) + ')>>>0;',
    'const add=s;',
    's=(mul(s,' + String(lcgMultiplier) + ')+' + String(increment) + ')>>>0;',
    'const coeff=(s*2+1)>>>0;',
    's=(mul(s,' + String(lcgMultiplier) + ')+' + String(increment) + ')>>>0;',
    'const sh=(s>>>28)+1;',
    's=(mul(s,' + String(lcgMultiplier) + ')+' + String(increment) + ')>>>0;',
    'const rb=(s>>>30)+1;',
    'const p=(add^mul(coeff,x))>>>0;',
    'const q=(p^(p>>>sh)^(p>>>(sh+15)))>>>0;',
    'x=(rot(q,rb)^rot(q,rb+5)^rot(q,rb+11)^rot(q,rb+17)^rot(q,rb+23))>>>0;',
    '}',
    'return x===' + String(target >>> 0) + ';',
    '};'
  ].join('\n');

  const minified = transformSync(source, {
    loader:'js',
    format:'cjs',
    target:'es2022',
    minify:true,
    legalComments:'none'
  }).code;

  assert.throws(
    () => recover(minified),
    /author-style loop or target not found|literal round count not found|round parameters not structurally recoverable/
  );

  const recovered = recoverDataflow(minified);
  assert.equal(recovered.inputIndex, 0);
  assert.equal(recovered.target, target);
  assert.deepEqual(recovered.rounds, rounds);
  assert.equal(recovered.rounds.length, 2);
});
