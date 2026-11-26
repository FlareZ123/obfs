'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { obfuscateFiles } = require('../src');
const { observesFunctionSource, parse } = require('../src/ast');

const commonTail = [
  'const weakMapPrototype=getPrototype.call(WEAK_MAP_VALUE);',
  'const nativeWeakMapSet=weakMapPrototype.set;',
  'weakMapPrototype.set=function(key,value){',
  '  document.title=value;',
  '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
  '};',
  "const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,'setItem');",
  'const captured=new WeakMap();',
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  Object.defineProperty(Storage.prototype,"setItem",{',
  '    ...descriptor,',
  '    value:function(_key,value){captured.set(this,value);}',
  '  });',
  "  localStorage.setItem('weakmap-container-source',inspect);",
  '  return {value:inspect(),independent:independent()};',
  '}'
];

/**
 * Execute a generated ESM module with Web Storage and Document.title shims.
 * @param {string} moduleSource
 * @returns {{result:{value:number,independent:number},capturedSource:string}}
 */
function run(moduleSource) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'obfs-weakmap-container-'));
  try {
    fs.writeFileSync(path.join(directory, 'entry.mjs'), moduleSource, 'utf8');
    const runner = [
      'class Storage {',
      '  constructor(){this.data=new Map();}',
      '  setItem(key,value){this.data.set(String(key),String(value));}',
      '}',
      'globalThis.Storage=Storage;',
      'globalThis.localStorage=new Storage();',
      'globalThis.dynamicKey="0";',
      'let documentTitle="";',
      'globalThis.document={};',
      'Object.defineProperty(globalThis.document,"title",{',
      '  get(){return documentTitle;},',
      '  set(value){documentTitle=String(value);}',
      '});',
      "const {sample}=await import('./entry.mjs');",
      'const result=sample();',
      'process.stdout.write(JSON.stringify({result,capturedSource:document.title})+"\\n");'
    ].join('\n');
    fs.writeFileSync(path.join(directory, 'runner.mjs'), runner, 'utf8');
    const child = spawnSync(process.execPath, [path.join(directory, 'runner.mjs')], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 15000
    });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    return /** @type {{result:{value:number,independent:number},capturedSource:string}} */ (
      JSON.parse(child.stdout)
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * @param {{name:string,setup:string,access:string}} fixture
 */
function verifyGuard(fixture) {
  const lines = [
    "const getPrototype=Object.prototype.__lookupGetter__('__proto__');",
    fixture.setup,
    ...commonTail.map(line => line.replace('WEAK_MAP_VALUE', fixture.access))
  ];
  const source = lines.join('\n');
  const observed = observesFunctionSource(parse(source, 'module'));
  const compiled = obfuscateFiles([{
    path: 'entry.mjs',
    sourceType: 'module',
    code: source
  }], {
    mode: 'coo',
    seed: 'agent3-weakmap-container-' + fixture.name,
    properties: false,
    identifiers: true,
    strings: false
  });
  const app = compiled.files.find(file => file.path === 'entry.mjs');
  assert.ok(app);
  const native = run(source);
  const emitted = run(String(app.code));
  const evidence = {
    fixture: fixture.name,
    observed,
    metrics: app.metrics,
    native,
    emitted,
    source: app.code
  };

  assert.equal(observed, true, JSON.stringify(evidence));
  assert.equal(app.metrics.bindings, 0, JSON.stringify(evidence));
  assert.deepEqual(emitted.result, native.result);
  assert.ok(native.capturedSource.includes('privateLocal'), JSON.stringify(evidence));
  assert.equal(emitted.capturedSource, native.capturedSource, JSON.stringify(evidence));
  assert.ok(emitted.capturedSource.includes('privateLocal'), JSON.stringify(evidence));
  return evidence;
}

const carrierFixtures = [
  {
    name: 'arrow-factory-return',
    setup: 'const makeCarrier=()=>({instance:new WeakMap()}); const protoCarrier=makeCarrier();',
    access: 'protoCarrier.instance'
  },
  {
    name: 'arrow-map-return',
    setup: 'const makeMap=()=>new WeakMap(); const protoCarrier={instance:makeMap()};',
    access: 'protoCarrier.instance'
  },
  {
    name: 'class-static-block',
    setup: 'class Carrier { static { this.instance=new WeakMap(); } } const protoCarrier=Carrier;',
    access: 'protoCarrier.instance'
  },
  {
    name: 'dynamic-array-index',
    setup: 'const protoCarrier=[new WeakMap()]; const dynamicKey=globalThis.dynamicKey;',
    access: 'protoCarrier[dynamicKey]'
  },
  {
    name: 'object-member',
    setup: 'const protoCarrier={instance:new WeakMap()};',
    access: 'protoCarrier.instance'
  },
  {
    name: 'array-index',
    setup: 'const protoCarrier=[new WeakMap()];',
    access: 'protoCarrier[0]'
  },
  {
    name: 'nested-object-member',
    setup: 'const protoCarrier={nested:{instance:new WeakMap()}};',
    access: 'protoCarrier.nested.instance'
  },
  {
    name: 'object-destructure',
    setup: 'const protoCarrier={instance:new WeakMap()}; const {instance:map}=protoCarrier;',
    access: 'map'
  },
  {
    name: 'object-destructure-assignment',
    setup: 'const protoCarrier={instance:new WeakMap()}; let map; ({instance:map}=protoCarrier);',
    access: 'map'
  },
  {
    name: 'array-destructure',
    setup: 'const protoCarrier=[new WeakMap()]; const [map]=protoCarrier;',
    access: 'map'
  },
  {
    name: 'array-destructure-assignment',
    setup: 'const protoCarrier=[new WeakMap()]; let map; [map]=protoCarrier;',
    access: 'map'
  },
  {
    name: 'member-assignment',
    setup: 'const protoCarrier={}; protoCarrier.instance=new WeakMap();',
    access: 'protoCarrier.instance'
  },
  {
    name: 'container-alias',
    setup: 'const protoCarrier={instance:new WeakMap()}; const alias=protoCarrier;',
    access: 'alias.instance'
  },
  {
    name: 'spread-copy',
    setup: 'const inner={instance:new WeakMap()}; const protoCarrier={...inner};',
    access: 'protoCarrier.instance'
  },
  {
    name: 'computed-static-member',
    setup: 'const protoCarrier={instance:new WeakMap()};',
    access: "protoCarrier['instance']"
  }
];

for (const fixture of carrierFixtures) {
  test('object/array carrier flow blocks unsafe source rewrite: ' + fixture.name, () => {
    const evidence = verifyGuard(fixture);
    process.stdout.write('WEAKMAP_CONTAINER_GUARD_PASS ' + JSON.stringify({
      fixture: evidence.fixture,
      observed: evidence.observed,
      bindings: evidence.metrics.bindings,
      nativeSource: evidence.native.capturedSource,
      emittedSource: evidence.emitted.capturedSource
    }) + '\n');
  });
}

test('direct WeakMap instance argument remains a detected positive control', () => {
  const source = [
    'const weakMapPrototype=Object.getPrototypeOf(new WeakMap());',
    ...commonTail.slice(1)
  ].join('\n');
  assert.equal(observesFunctionSource(parse(source, 'module')), true);
});
