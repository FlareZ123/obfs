const assert = require('node:assert/strict');
const vm = require('node:vm');

/** @type {Array<{label:string,expected:string,frame:{name:string|null,line:number|null,column:number|null,hasFunction:boolean}|null,callerChainNames:string[],callerChainHasExactSource:boolean,observedSource:string|null}>} */
const results = [];
let expectedActiveName = '';

/**
 * Capture both caller-chain source and V8 CallSite metadata while invoked
 * from a callback that a native built-in dispatches.
 * @param {string} label
 */
function capture(label) {
  /** @type {string[]} */
  const callerChainNames = [];
  /** @type {string[]} */
  const callerSources = [];
  let current = arguments.callee;
  for (let depth = 0; depth < 8 && current; depth++) {
    callerChainNames.push(current.name || '<anonymous>');
    try {
      callerSources.push(Function.prototype.toString.call(current));
      current = current.caller;
    } catch {
      current = null;
    }
  }

  const previous = Error.prepareStackTrace;
  Error.prepareStackTrace = (_error, sites) => sites.map(site => ({
    name: site.getFunctionName(),
    line: site.getLineNumber(),
    column: site.getColumnNumber(),
    hasFunction: Boolean(site.getFunction())
  }));
  const stack = new Error(label).stack;
  Error.prepareStackTrace = previous;
  const frame = stack.find(site => site.name === expectedActiveName) ?? null;
  const observedSource = callerSources.find(source =>
    source.includes(`function ${expectedActiveName}(`) ||
    source.includes(`function ${expectedActiveName} ()`)
  ) ?? null;
  results.push({
    label,
    expected: expectedActiveName,
    frame,
    callerChainNames,
    callerChainHasExactSource: observedSource !== null,
    observedSource
  });
}

function hiddenJsonToJSON() {
  expectedActiveName = 'hiddenJsonToJSON';
  return JSON.stringify({ toJSON() { capture('json-toJSON'); return 1; } });
}
function hiddenJsonReplacer() {
  expectedActiveName = 'hiddenJsonReplacer';
  const owner = { secretField: 1 };
  return JSON.stringify({ x: owner.secretField }, function replacer(key, value) {
    if (key === 'x') capture('json-replacer');
    return value;
  });
}
function hiddenJsonReviver() {
  expectedActiveName = 'hiddenJsonReviver';
  const owner = { secretField: 1 };
  return owner.secretField + JSON.parse('{"x":1}', function reviver(key, value) {
    if (key === 'x') capture('json-reviver');
    return value;
  });
}
function hiddenArraySort() {
  expectedActiveName = 'hiddenArraySort';
  return [2, 1].sort(function compare(a, b) {
    capture('array-sort');
    return a - b;
  });
}
function hiddenStringReplace() {
  expectedActiveName = 'hiddenStringReplace';
  return 'a'.replace(/a/, function replacement() {
    capture('string-replace');
    return 'b';
  });
}
function hiddenArrayMap() {
  expectedActiveName = 'hiddenArrayMap';
  return [1].map(function mapper(value) {
    capture('array-map');
    return value;
  });
}
function hiddenMapForEach() {
  expectedActiveName = 'hiddenMapForEach';
  new Map([['x', 1]]).forEach(function visitor() {
    capture('map-forEach');
  });
}
function hiddenArrayFromMap() {
  expectedActiveName = 'hiddenArrayFromMap';
  return Array.from([1], function mapFn(value) {
    capture('array-from-map');
    return value;
  });
}
async function hiddenPromiseThen() {
  expectedActiveName = 'hiddenPromiseThen';
  return Promise.resolve(1).then(function handler(value) {
    capture('promise-then-async-control');
    return value;
  });
}

(async () => {
  hiddenJsonToJSON();
  hiddenJsonReplacer();
  hiddenJsonReviver();
  hiddenArraySort();
  hiddenStringReplace();
  hiddenArrayMap();
  hiddenMapForEach();
  hiddenArrayFromMap();
  await hiddenPromiseThen();

  for (const result of results) {
    if (result.label === 'promise-then-async-control') {
      assert.equal(result.frame, null, 'deferred Promise.then callback should not inherit the completed caller frame');
    } else {
      assert.ok(result.frame, `${result.label} should expose the active function in V8 CallSite metadata`);
      assert.equal(result.frame.name, result.expected);
      assert.ok(Number.isInteger(result.frame.line) && Number.isInteger(result.frame.column));
    }
  }
  assert.ok(results.find(r => r.label === 'json-replacer')?.callerChainHasExactSource,
    'JSON.stringify replacer should expose the active hidden function through sloppy caller introspection');
  assert.ok(results.find(r => r.label === 'json-reviver')?.callerChainHasExactSource,
    'JSON.parse reviver should expose the active hidden function through sloppy caller introspection');
  assert.ok(results.find(r => r.label === 'json-replacer')?.observedSource?.includes('owner.secretField'),
    'JSON.stringify replacer should expose the exact owner property spelling in the active function source');
  assert.ok(results.find(r => r.label === 'json-reviver')?.observedSource?.includes('owner.secretField'),
    'JSON.parse reviver should expose the exact owner property spelling in the active function source');
  assert.ok(!results.find(r => r.label === 'json-toJSON')?.callerChainHasExactSource,
    'JSON toJSON callback should be distinguished from replacer/reviver caller-chain behavior');

  /** @type {Record<string,number>} */
  const widthColumns = {};
  function captureWidth(label) {
    const previous = Error.prepareStackTrace;
    Error.prepareStackTrace = (_error, sites) => sites.map(site => ({
      name: site.getFunctionName(), column: site.getColumnNumber()
    }));
    const stack = new Error(label).stack;
    Error.prepareStackTrace = previous;
    const frame = stack.find(site => site.name === 'hidden');
    assert.ok(frame && Number.isInteger(frame.column), `${label} should expose hidden frame column`);
    widthColumns[label] = frame.column;
  }
  const longSource = 'function hidden(){const owner={longPrivatePropertyName:1};[1].map(function(){captureWidth("long")});return owner.longPrivatePropertyName;} hidden();';
  const shortSource = 'function hidden(){const owner={x:1};[1].map(function(){captureWidth("short")});return owner.x;} hidden();';
  const longValue = vm.runInNewContext(longSource, {captureWidth});
  const shortValue = vm.runInNewContext(shortSource, {captureWidth});
  assert.equal(longValue, shortValue);
  assert.equal(widthColumns.long - widthColumns.short, 22,
    'shortening a preceding property spelling should shift the observed callback frame column by 22');

  console.log(JSON.stringify({node:process.version,passed:results.length,widthColumns,results},null,2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
