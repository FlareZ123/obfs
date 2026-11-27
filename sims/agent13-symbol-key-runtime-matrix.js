#!/usr/bin/env node
'use strict';

/**
 * Runtime-only Node Web Storage matrix for well-known Symbol property keys.
 *
 * Run with Node 22.16+:
 *   node sims/agent13-symbol-key-runtime-matrix.js
 *
 * Each case runs in a fresh child process with --experimental-webstorage and
 * a distinct --localstorage-file. This tests ECMAScript/runtime semantics,
 * not the obfuscator, a compiler differential, or a security boundary.
 *
 * @file
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/**
 * @typedef {Object} RuntimeCase
 * @property {string} name
 * @property {string} entryFile
 * @property {string} entrySource
 * @property {number} expectedValue
 * @property {Record<string,string>=} extraFiles
 * @property {string=} preloadSource
 * @property {string=} expectedStored
 * @property {boolean} expectSource
 * @property {boolean=} expectObservedSource
 * @property {boolean=} expectSameWellKnown
 */

/**
 * @typedef {Object} RuntimeResult
 * @property {string} name
 * @property {string} stored
 * @property {boolean} containsSource
 * @property {number} value
 * @property {string=} observed
 * @property {boolean=} observerSawSource
 * @property {boolean=} sameWellKnown
 */

/**
 * @param {...string} parts
 * @returns {string}
 */
const lines = (...parts) => parts.join('\n');

/**
 * @param {number} value
 * @param {string} hookResult
 * @returns {string}
 */
function directSource(value, hookResult) {
  return lines(
    "function inspect(){const privateLocal=" + value + ";return privateLocal;}",
    "inspect[Symbol.toPrimitive]=function(hint){return hint==='string'?" + JSON.stringify(hookResult) + ":'wrong';};",
    "localStorage.setItem('probe',inspect);",
    "const stored=localStorage.getItem('probe');",
    "console.log(JSON.stringify({stored,value:inspect()}));"
  );
}

/**
 * Run one isolated case and validate its observable Storage conversion.
 *
 * @param {RuntimeCase} testCase
 * @returns {RuntimeResult}
 */
function runCase(testCase) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obfs-symbol-key-' + testCase.name + '-'));
  try {
    for (const [name, source] of Object.entries(testCase.extraFiles || {})) {
      fs.writeFileSync(path.join(root, name), source, 'utf8');
    }
    fs.writeFileSync(path.join(root, testCase.entryFile), testCase.entrySource, 'utf8');
    const storageFile = path.join(root, 'storage.db');
    fs.writeFileSync(storageFile, '', 'utf8');
    const args = ['--experimental-webstorage', '--localstorage-file=' + storageFile];
    if (testCase.preloadSource) {
      const preloadFile = path.join(root, 'preload.cjs');
      fs.writeFileSync(preloadFile, testCase.preloadSource, 'utf8');
      args.push('--require', preloadFile);
    }
    args.push(path.join(root, testCase.entryFile));
    const child = spawnSync(process.execPath, args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000
    });
    if (child.error) throw child.error;
    assert.equal(child.status, 0, testCase.name + ' child failed: ' + child.stderr);
    const output = JSON.parse(child.stdout.trim());
    assert.equal(output.value, testCase.expectedValue, testCase.name + ' return value');
    if (typeof testCase.expectedStored === 'string') {
      assert.equal(output.stored, testCase.expectedStored, testCase.name + ' stored value');
    }
    const containsSource = String(output.stored).includes('privateLocal');
    assert.equal(containsSource, testCase.expectSource, testCase.name + ' source visibility');
    if (typeof testCase.expectObservedSource === 'boolean') {
      assert.equal(output.observerSawSource, testCase.expectObservedSource, testCase.name + ' getter source observation');
    }
    if (typeof testCase.expectSameWellKnown === 'boolean') {
      assert.equal(output.sameWellKnown, testCase.expectSameWellKnown, testCase.name + ' cross-realm symbol identity');
    }
    return {
      name: testCase.name,
      stored: output.stored,
      containsSource,
      value: output.value,
      ...(typeof output.observed === 'string' ? { observed: output.observed } : {}),
      ...(typeof output.observerSawSource === 'boolean' ? { observerSawSource: output.observerSawSource } : {}),
      ...(typeof output.sameWellKnown === 'boolean' ? { sameWellKnown: output.sameWellKnown } : {})
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const fakeKey = "Symbol.for('Symbol.toPrimitive')";
const fakePreload = "(()=>{const realSymbol=globalThis.Symbol;globalThis.Symbol={toPrimitive:realSymbol.for('Symbol.toPrimitive')};})();";
const realWrapperPreload = "(()=>{const realSymbol=globalThis.Symbol;globalThis.Symbol={toPrimitive:realSymbol.toPrimitive};})();";
const helperModule = lines(
  "export function create(SymbolCtor,label,privateValue){",
  "  const key=SymbolCtor.toPrimitive;",
  "  function inspect(){const privateLocal=privateValue;return privateLocal;",
  "  inspect[key]=function(hint){return hint==='string'?label:'wrong';};",
  "  return inspect;",
  "}"
);

/** @type {RuntimeCase[]} */
const cases = [
  {
    name: 'direct-real', entryFile: 'entry.cjs', expectedValue: 17,
    entrySource: directSource(17, 'direct-real-hook'),
    expectedStored: 'direct-real-hook', expectSource: false
  },
  {
    name: 'preloader-fake-key', entryFile: 'entry.cjs', expectedValue: 19,
    entrySource: directSource(19, 'preloader-fake-hook'),
    preloadSource: fakePreload, expectSource: true
  },
  {
    name: 'preloader-userland-real-key', entryFile: 'entry.cjs', expectedValue: 23,
    entrySource: directSource(23, 'preloader-real-wrapper-hook'),
    preloadSource: realWrapperPreload,
    expectedStored: 'preloader-real-wrapper-hook', expectSource: false
  },
  {
    name: 'local-symbol-shadow', entryFile: 'entry.cjs', expectedValue: 29,
    entrySource: lines(
      "const Symbol={toPrimitive:'toPrimitive'};",
      "function inspect(){const privateLocal=29;return privateLocal;}",
      "inspect[Symbol.toPrimitive]=function(){return 'local-shadow-hook';};",
      "localStorage.setItem('probe',inspect);",
      "const stored=localStorage.getItem('probe');",
      "console.log(JSON.stringify({stored,value:inspect()}));"
    ),
    expectSource: true
  },
  {
    name: 'local-globalThis-shadow', entryFile: 'entry.cjs', expectedValue: 31,
    entrySource: lines(
      "const globalThis={Symbol:{toPrimitive:'toPrimitive'}};",
      "function inspect(){const privateLocal=31;return privateLocal;}",
      "inspect[globalThis.Symbol.toPrimitive]=function(){return 'globalThis-shadow-hook';};",
      "localStorage.setItem('probe',inspect);",
      "const stored=localStorage.getItem('probe');",
      "console.log(JSON.stringify({stored,value:inspect()}));"
    ),
    expectSource: true
  },
  {
    name: 'local-globalThis-real-wrapper', entryFile: 'entry.cjs', expectedValue: 157,
    entrySource: lines(
      "const realSymbol=Symbol;",
      "const globalThis={Symbol:{toPrimitive:realSymbol.toPrimitive}};",
      "function inspect(){const privateLocal=157;return privateLocal;}",
      "inspect[globalThis.Symbol.toPrimitive]=function(hint){return hint==='string'?'local-globalThis-wrapper-hook':'wrong';};",
      "localStorage.setItem('probe',inspect);",
      "const stored=localStorage.getItem('probe');",
      "console.log(JSON.stringify({stored,value:inspect()}));"
    ),
    expectedStored: 'local-globalThis-wrapper-hook', expectSource: false
  },
  {
    name: 'globalThis-real-root', entryFile: 'entry.cjs', expectedValue: 33,
    entrySource: lines(
      "function inspect(){const privateLocal=33;return privateLocal;}",
      "inspect[globalThis.Symbol.toPrimitive]=function(hint){return hint==='string'?'globalThis-real-hook':'wrong';};",
      "localStorage.setItem('probe',inspect);",
      "const stored=localStorage.getItem('probe');",
      "console.log(JSON.stringify({stored,value:inspect()}));"
    ),
    expectedStored: 'globalThis-real-hook', expectSource: false
  },
  {
    name: 'mutable-key-reassigned-fake', entryFile: 'entry.cjs', expectedValue: 37,
    entrySource: lines(
      "let key=Symbol.toPrimitive;key=" + fakeKey + ";",
      "function inspect(){const privateLocal=37;return privateLocal;}",
      "inspect[key]=function(){return 'mutable-fake-hook';};",
      "localStorage.setItem('probe',inspect);",
      "const stored=localStorage.getItem('probe');",
      "console.log(JSON.stringify({stored,value:inspect()}));"
    ),
    expectSource: true
  },
  {
    name: 'captured-key-survives-source-reassignment', entryFile: 'entry.cjs', expectedValue: 41,
    entrySource: lines(
      "let key=Symbol.toPrimitive;const captured=key;key=" + fakeKey + ";",
      "function inspect(){const privateLocal=41;return privateLocal;}",
      "inspect[captured]=function(hint){return hint==='string'?'captured-real-hook':'wrong';};",
      "localStorage.setItem('probe',inspect);",
      "const stored=localStorage.getItem('probe');",
      "console.log(JSON.stringify({stored,value:inspect()}));"
    ),
    expectedStored: 'captured-real-hook', expectSource: false
  },
  {
    name: 'factory-real-actual-formal-return', entryFile: 'entry.cjs', expectedValue: 43,
    entrySource: lines(
      "function create(SymbolCtor,label){const key=SymbolCtor.toPrimitive;",
      "function inspect(){const privateLocal=43;return privateLocal;}",
      "inspect[key]=function(hint){return hint==='string'?label:'wrong';};return inspect;}",
      "const inspect=create(Symbol,'factory-real-hook');",
      "localStorage.setItem('probe',inspect);",
      "const stored=localStorage.getItem('probe');",
      "console.log(JSON.stringify({stored,value:inspect()}));"
    ),
    expectedStored: 'factory-real-hook', expectSource: false
  },
  {
    name: 'factory-fake-actual-formal-return', entryFile: 'entry.cjs', expectedValue: 47,
    entrySource: lines(
      "function create(SymbolCtor,label){const key=SymbolCtor.toPrimitive;",
      "function inspect(){const privateLocal=47;return privateLocal;}",
      "inspect[key]=function(hint){return hint==='string'?label:'wrong';};return inspect;}",
      "const fakeSymbolCtor={toPrimitive:" + fakeKey + "};",
      "const inspect=create(fakeSymbolCtor,'factory-fake-hook');",
      "localStorage.setItem('probe',inspect);",
      "const stored=localStorage.getItem('probe');",
      "console.log(JSON.stringify({stored,value:inspect()}));"
    ),
    expectSource: true
  },
  {
    name: 'cross-file-esm-real', entryFile: 'main.mjs', expectedValue: 53,
    extraFiles: { 'helper.mjs': helperModule },
    entrySource: lines(
      "import {create} from './helper.mjs';",
      "const inspect=create(Symbol,'cross-file-real-hook',53);",
      "localStorage.setItem('probe',inspect);",
      "const stored=localStorage.getItem('probe');",
      "console.log(JSON.stringify({stored,value:inspect()}));"
    ),
    expectedStored: 'cross-file-real-hook', expectSource: false
  },
  {
    name: 'cross-file-esm-fake', entryFile: 'main.mjs', expectedValue: 59,
    extraFiles: { 'helper.mjs': helperModule },
    entrySource: lines(
      "import {create} from './helper.mjs';",
      "const fakeSymbolCtor={toPrimitive:" + fakeKey + "};",
      "const inspect=create(fakeSymbolCtor,'cross-file-fake-hook',59);",
      "localStorage.setItem('probe',inspect);",
      "const stored=localStorage.getItem('probe');",
      "console.log(JSON.stringify({stored,value:inspect()}));"
    ),
    expectSource: true
  },
  {
    name: 'pure-userland-key-getter', entryFile: 'entry.cjs', expectedValue: 61,
    entrySource: lines(
      "function inspect(){const privateLocal=61;return privateLocal;}",
      "const SymbolCtor={get toPrimitive(){return Symbol.toPrimitive;}};",
      "inspect[SymbolCtor.toPrimitive]=function(hint){return hint==='string'?'pure-getter-hook':'wrong';};",
      "localStorage.setItem('probe',inspect);",
      "const stored=localStorage.getItem('probe');",
      "console.log(JSON.stringify({stored,value:inspect()}));"
    ),
    expectedStored: 'pure-getter-hook', expectSource: false
  },
  {
    name: 'source-observing-key-getter', entryFile: 'entry.cjs', expectedValue: 67,
    entrySource: lines(
      "function inspect(){const privateLocal=67;return privateLocal;}",
      "let observed='';",
      "const SymbolCtor={get toPrimitive(){observed=Function.prototype.toString.call(inspect);return Symbol.toPrimitive;}};",
      "inspect[SymbolCtor.toPrimitive]=function(hint){return hint==='string'?'source-getter-hook':'wrong';};",
      "localStorage.setItem('probe',inspect);",
      "const stored=localStorage.getItem('probe');",
      "console.log(JSON.stringify({stored,value:inspect(),observed,observerSawSource:observed.includes('privateLocal')}));"
    ),
    expectedStored: 'source-getter-hook', expectSource: false, expectObservedSource: true
  },
  {
    name: 'pure-proxy-key-get', entryFile: 'entry.cjs', expectedValue: 149,
    entrySource: lines(
      "function inspect(){const privateLocal=149;return privateLocal;}",
      "const SymbolCtor=new Proxy({toPrimitive:Symbol.toPrimitive},{get(target,key,receiver){return Reflect.get(target,key,receiver);}});",
      "inspect[SymbolCtor.toPrimitive]=function(hint){return hint==='string'?'pure-proxy-hook':'wrong';};",
      "localStorage.setItem('probe',inspect);",
      "const stored=localStorage.getItem('probe');",
      "console.log(JSON.stringify({stored,value:inspect()}));"
    ),
    expectedStored: 'pure-proxy-hook', expectSource: false
  },
  {
    name: 'source-observing-proxy-key-get', entryFile: 'entry.cjs', expectedValue: 151,
    entrySource: lines(
      "function inspect(){const privateLocal=151;return privateLocal;}",
      "let observed='';",
      "const SymbolCtor=new Proxy({toPrimitive:Symbol.toPrimitive},{get(target,key,receiver){if(key==='toPrimitive')observed=Function.prototype.toString.call(inspect);return Reflect.get(target,key,receiver);}});",
      "inspect[SymbolCtor.toPrimitive]=function(hint){return hint==='string'?'source-proxy-hook':'wrong';};",
      "localStorage.setItem('probe',inspect);",
      "const stored=localStorage.getItem('probe');",
      "console.log(JSON.stringify({stored,value:inspect(),observed,observerSawSource:observed.includes('privateLocal')}));"
    ),
    expectedStored: 'source-proxy-hook', expectSource: false, expectObservedSource: true
  },
  {
    name: 'cross-realm-well-known-symbol', entryFile: 'entry.cjs', expectedValue: 71,
    entrySource: lines(
      "const vm=require('node:vm');const SymbolCtor=vm.runInNewContext('Symbol');",
      "const sameWellKnown=SymbolCtor.toPrimitive===Symbol.toPrimitive;",
      "function inspect(){const privateLocal=71;return privateLocal;}",
      "inspect[SymbolCtor.toPrimitive]=function(hint){return hint==='string'?'cross-realm-hook':'wrong';};",
      "localStorage.setItem('probe',inspect);",
      "const stored=localStorage.getItem('probe');",
      "console.log(JSON.stringify({stored,value:inspect(),sameWellKnown}));"
    ),
    expectedStored: 'cross-realm-hook', expectSource: false, expectSameWellKnown: true
  }
];

/** @type {RuntimeResult[]} */
const results = cases.map(runCase);
console.log(JSON.stringify({
  runtime: process.version,
  mode: 'runtime-semantics-only',
  cases: results.length,
  results
}, null, 2));
