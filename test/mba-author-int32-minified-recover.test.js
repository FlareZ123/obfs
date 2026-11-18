'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {transformSync} = require('esbuild');
const {recover} = require('../sims/mba-author-int32-minified-recover');
const {
  forwardChain32,
  inverseChain32
} = require('../sims/mba-author-int32-component-inverse');

test('frozen Int32 source-aware attacker recovers an ordinary-minified predicate', () => {
  const round = {
    coefficients: [0x91e10da5, 0x6d2b79f5],
    xorShifts: [7, 19],
    cyclicShifts: [3, 11, 23]
  };
  const rounds = 4;
  const secret = 47;
  const target = forwardChain32(secret, Array.from({length: rounds}, () => round));
  const source = [
    "'use strict';",
    "module.exports=function f(c){",
    "let x=c>>>0;",
    "for(let i=0;i<4;i++){",
    "x=(0x91e10da5^Math.imul(0x6d2b79f5,x))>>>0;",
    "x=(x^(x>>>7)^(x>>>19))>>>0;",
    "x=(((x<<3)|(x>>>29))^((x<<11)|(x>>>21))^((x<<23)|(x>>>9)))>>>0;",
    "}",
    `return x===${target};`,
    "};"
  ].join('\n');
  const minified = transformSync(source, {
    loader: 'js',
    format: 'cjs',
    target: 'es2022',
    minify: true,
    legalComments: 'none'
  }).code;

  const recovered = recover(minified);
  assert.equal(recovered.rounds, rounds);
  assert.deepEqual(recovered.coefficients, round.coefficients);
  assert.deepEqual(recovered.xorShifts, round.xorShifts);
  assert.deepEqual(recovered.cyclicShifts, round.cyclicShifts);
  assert.equal(recovered.target, target);

  const recoveredInput = inverseChain32(
    recovered.target,
    Array.from({length: recovered.rounds}, () => ({
      coefficients: recovered.coefficients,
      xorShifts: recovered.xorShifts,
      cyclicShifts: recovered.cyclicShifts
    }))
  );
  assert.equal(recoveredInput, secret);
});
