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
    hostSpy: (/** @type {number} */ value) => ({
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

/**
 * Observe V8 structured call sites from a same-realm host callback. The
 * observer is created independently of the evaluated caller, and only the
 * numeric result is passed to it. This is Node/V8-specific research code.
 * @param {string} property
 * @param {boolean} strict
 * @returns {{value:number,name:string,column:number,source:string|null}}
 */
function observeStructuredSite(property, strict) {
  const directive = strict ? "'use strict'; " : '';
  const hostSpy = new Function('value', `
    const prior = Error.prepareStackTrace;
    try {
      Error.prepareStackTrace = (_, sites) => sites;
      const frame = (new Error()).stack.find(site => site.getFunctionName() === 'evaluate');
      const caller = frame.getFunction();
      return { value, name: frame.getFunctionName(), column: frame.getColumnNumber(),
        source: caller ? Function.prototype.toString.call(caller) : null };
    } finally { Error.prepareStackTrace = prior; }
  `);
  const source = `function evaluate() { ${directive}const owner = { ${property}: 73 }; return hostSpy(owner.${property}); }\nreturn evaluate();`;
  return new Function('hostSpy', source)(hostSpy);
}

const structuredPairs = [];
for (const strict of [false, true]) {
  const original = observeStructuredSite(originalProperty, strict);
  const shortened = observeStructuredSite(shortenedProperty, strict);
  assert.equal(original.value, 73);
  assert.equal(shortened.value, 73);
  assert.equal(original.name, 'evaluate');
  assert.equal(shortened.name, 'evaluate');
  assert.equal(original.column - shortened.column,
    originalProperty.length - shortenedProperty.length);
  if (strict) {
    assert.equal(original.source, null);
    assert.equal(shortened.source, null);
  } else {
    assert.ok(original.source);
    assert.ok(shortened.source);
    assert.match(original.source, /owner\.longPrivatePropertyName/);
    assert.match(shortened.source, /owner\.x/);
  }
  structuredPairs.push({strict, original, shortened});
}

console.log(JSON.stringify({ runtime: process.version, pairs, structuredPairs }, null, 2));
