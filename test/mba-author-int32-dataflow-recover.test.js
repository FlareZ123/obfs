'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {transformSync} = require('esbuild');
const {recover} = require('../sims/mba-author-int32-minified-recover');
const {recoverDataflow} = require('../sims/mba-author-int32-dataflow-recover');
const {
  forwardChain32,
  inverseChain32
} = require('../sims/mba-author-int32-component-inverse');

test('dataflow attacker recovers mixed independently parameterized unrolled rounds', () => {
  const rounds = [
    {
      coefficients: [0x91e10da5, 0x6d2b79f5],
      xorShifts: [7, 19],
      cyclicShifts: [3, 11, 23]
    },
    {
      coefficients: [0x243f6a88, 0x9e3779b1],
      xorShifts: [9, 21],
      cyclicShifts: [5, 13, 27]
    }
  ];
  const secret = 47;
  const target = forwardChain32(secret, rounds);
  const splitA = 0x13579bdf;
  const splitB = (rounds[0].coefficients[0] ^ splitA) >>> 0;
  const splitC = 0x2468ace0;
  const splitD = (rounds[1].coefficients[0] ^ splitC) >>> 0;

  const source = [
    "'use strict';",
    "function r(v,s){return (((v<<s)|(v>>>(32-s)))>>>0);}",
    "module.exports=function f(c){",
    "const mul=Math.imul;",
    "let x=c>>>0;",
    `const a=${splitA},b=${splitB};`,
    `const p=(mul(x,${rounds[0].coefficients[1]})^a^b)>>>0;`,
    "const q=p>>>5;",
    "const s=(p^(p>>>19)^q^q^(p>>>7))>>>0;",
    "x=(r(s,23)^r(s,3)^r(s,11))>>>0;",
    `const d=${splitC},e=${splitD};`,
    `const u=(d^mul(${rounds[1].coefficients[1]},x)^e)>>>0;`,
    "const z=u>>>17;",
    "const t=(u^(u>>>21)^z^z^(u>>>9))>>>0;",
    "x=(r(t,13)^r(t,27)^r(t,5))>>>0;",
    `return ${target}===x;`,
    "};"
  ].join('\n');

  const minified = transformSync(source, {
    loader: 'js',
    format: 'cjs',
    target: 'es2022',
    minify: true,
    legalComments: 'none'
  }).code;

  assert.throws(
    () => recover(minified),
    /author-style loop or target not found/,
    'The older syntax recognizer should not understand the unrolled mixed form'
  );

  const recovered = recoverDataflow(minified);
  assert.equal(recovered.inputIndex, 0);
  assert.equal(recovered.target, target);
  assert.deepEqual(recovered.rounds, rounds);

  const recoveredInput = inverseChain32(recovered.target, recovered.rounds);
  assert.equal(recoveredInput, secret);
});
