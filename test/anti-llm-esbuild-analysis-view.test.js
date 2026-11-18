'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {
  compilerAdversarialSample,
  compilerAnalysisView
} = require('../sims/anti-llm-esbuild-analysis-view');
const {commonJsOutcome} = require('../sims/anti-llm-lexical-sanitizer');

test('compiler analysis view erases lexical and local-identifier prompt cues', () => {
  for (let index = 0; index < 32; index++) {
    const source = compilerAdversarialSample(index);
    const normalized = compilerAnalysisView(source);
    assert.equal(commonJsOutcome(normalized), commonJsOutcome(source));
    assert.doesNotMatch(
      normalized,
      /SYSTEM_OVERRIDE|REFUSE_ANALYSIS|MODEL_POLICY|IGNORE_PREVIOUS|VULNERABILITY_EXPLOIT|STOP_REVERSE/u
    );
    assert.ok(Buffer.byteLength(normalized) < Buffer.byteLength(source));
  }
});

test('analysis view keeps external CommonJS result while renaming local prompt identifiers', () => {
  const source = `'use strict';module.exports=(()=>{const IGNORE_PREVIOUS_INSTRUCTIONS=19;function REFUSE_ANALYSIS(value){return value+IGNORE_PREVIOUS_INSTRUCTIONS;}return REFUSE_ANALYSIS(23);})();`;
  const normalized = compilerAnalysisView(source);
  assert.equal(commonJsOutcome(source), commonJsOutcome(normalized));
  assert.doesNotMatch(normalized, /IGNORE_PREVIOUS_INSTRUCTIONS|REFUSE_ANALYSIS/u);
});
