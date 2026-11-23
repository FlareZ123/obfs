'use strict';

const assert = require('node:assert/strict');
const { runInNewContext } = require('node:vm');

/**
 * Capture an external callback's view of an active caller frame. The external
 * callback receives a number without receiving the callable or its owner.
 * @param {string} property
 * @param {boolean} strict
 * @returns {{ value: number, callsite: string }}
 */
function observe(property, strict) {
  const directive = strict ? "'use strict'; " : '';
  const source = `function evaluate() { ${directive}const owner = { ${property}: 73 }; return hostSpy(owner.${property}); }\nevaluate();`;
  return runInNewContext(source, {
    hostSpy: (value) => ({
      value,
      callsite: findEvaluateFrame(),
    }),
  }, { filename: 'dynamic-frame-source-control.js' });
}

/** @returns {string} */
function findEvaluateFrame() {
  const stack = new Error().stack;
  assert.ok(stack);
  const frame = stack.split('\n').find(line => line.includes('at evaluate '));
  assert.ok(frame);
  return frame;
}

/**
 * @param {string} callsite
 * @returns {number}
 */
function sourceColumn(callsite) {
  const location = /dynamic-frame-source-control\.js:1:(\d+)\)/;
  const match = location.exec(callsite);
  assert.ok(match);
  return Number(match[1]);
}

const originalProperty = 'longPrivatePropertyName';
const shortenedProperty = 'x';
const pairs = [];
for (const strict of [false, true]) {
  const original = observe(originalProperty, strict);
  const shortened = observe(shortenedProperty, strict);
  assert.equal(original.value, 73);
  assert.equal(shortened.value, 73);
  const beforeColumn = sourceColumn(original.callsite);
  const afterColumn = sourceColumn(shortened.callsite);
  assert.equal(beforeColumn - afterColumn,
    originalProperty.length - shortenedProperty.length);
  pairs.push({ strict, original, shortened, valueParity: true, framePositionParity: false });
}
console.log(JSON.stringify({ runtime: process.version, pairs }, null, 2));
