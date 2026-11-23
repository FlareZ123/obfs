'use strict';

const assert = require('node:assert/strict');
const { runInNewContext } = require('node:vm');

/**
 * Capture an external callback's view of a currently active source frame.
 * The callback receives a number, not the evaluated function or its owner.
 * @param {string} property
 * @returns {{ value: number, callsite: string }}
 */
function observe(property) {
  const source = `function evaluate() { const owner = { ${property}: 73 }; return hostSpy(owner.${property}); }\nevaluate();`;
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

const originalProperty = 'longPrivatePropertyName';
const shortenedProperty = 'x';
const original = observe(originalProperty);
const shortened = observe(shortenedProperty);

assert.equal(original.value, 73);
assert.equal(shortened.value, 73);
const location = /dynamic-frame-source-control\.js:1:(\d+)\)/;
assert.match(original.callsite, location);
assert.match(shortened.callsite, location);
const matchOriginal = location.exec(original.callsite);
const matchShortened = location.exec(shortened.callsite);
assert.ok(matchOriginal);
assert.ok(matchShortened);
const originalColumn = Number(matchOriginal[1]);
const shortenedColumn = Number(matchShortened[1]);
assert.equal(originalColumn - shortenedColumn,
  originalProperty.length - shortenedProperty.length);
console.log(JSON.stringify({
  runtime: process.version,
  original,
  shortened,
  valueParity: true,
  framePositionParity: false,
}, null, 2));
