'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {
  sanitizeLexicalNoise,
  commonJsOutcome,
  adversarialSample
} = require('../sims/anti-llm-lexical-sanitizer');

test('lexical sanitizer erases prompt-like comments and dead strings with exact behavior', () => {
  for (let index = 0; index < 32; index++) {
    const source = adversarialSample(index);
    const result = sanitizeLexicalNoise(source, 'commonjs');
    assert.equal(result.comments, 2);
    assert.equal(result.deadStrings, 2);
    assert.equal(commonJsOutcome(result.code), commonJsOutcome(source));
    assert.doesNotMatch(result.code, /SYSTEM OVERRIDE|IGNORE PRIOR|MODEL POLICY|malicious payload/u);
    assert.match(result.code, /'use strict'/u);
  }
});

test('comment blanking preserves ASI line terminators and regex syntax', () => {
  const samples = [
    `function f(){return/* prompt injection */\n17;}module.exports=f();`,
    `const ratio=12/* distraction */ / 3;module.exports=ratio;`,
    `const pattern=/a\\/\\/*b/u;/* outside */module.exports=pattern.test('a//*b');`,
    `let value=1;// instruction\nvalue++;module.exports=value;`
  ];
  for (const source of samples) {
    const result = sanitizeLexicalNoise(source, 'commonjs');
    assert.equal(commonJsOutcome(result.code), commonJsOutcome(source), source);
  }
});

test('directive prologue strings survive while later standalone strings are erased', () => {
  const source = `'use strict';'custom directive';const value=3;'dead model text';module.exports=value;`;
  const result = sanitizeLexicalNoise(source, 'commonjs');
  assert.match(result.code, /'use strict'/u);
  assert.match(result.code, /'custom directive'/u);
  assert.doesNotMatch(result.code, /dead model text/u);
  assert.equal(commonJsOutcome(result.code), commonJsOutcome(source));
});
