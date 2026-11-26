'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { obfuscateFiles } = require('../src');

const mutateSource = [
  "const getPrototype=Object.prototype.__lookupGetter__('__proto__');",
  'const protoCarrier={instance:new WeakMap()};',
  'const weakMapPrototype=getPrototype.call(protoCarrier.instance);',
  'const nativeWeakMapSet=weakMapPrototype.set;',
  'weakMapPrototype.set=function(key,value){',
  '  document.title=value;',
  '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
  '};'
].join('\n');

const storageSource = [
  'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
  'const captured=new WeakMap();',
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  Object.defineProperty(Storage.prototype,"setItem",{',
  '    ...descriptor,',
  '    value:function(_key,value){captured.set(this,value);}',
  '  });',
  "  localStorage.setItem('weakmap-cross-file-container',inspect);",
  '  return {value:inspect(),independent:independent()};',
  '}'
].join('\n');

const entrySource = [
  "import './mutate.mjs';",
  "export {sample} from './storage.mjs';"
].join('\n');

const sourceFiles = [
  { path: 'entry.mjs', sourceType: 'module', code: entrySource },
  { path: 'mutate.mjs', sourceType: 'module', code: mutateSource },
  { path: 'storage.mjs', sourceType: 'module', code: storageSource }
];

/**
 * Execute the supplied ESM graph with Web Storage and Document.title shims.
 * @param {Array<{path:string,code:string}>} files
 * @returns {{result:{value:number,independent:number},capturedSource:string}}
 */
function run(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'obfs-weakmap-cross-file-'));
  try {
    for (const file of files) {
      fs.writeFileSync(path.join(directory, file.path), file.code, 'utf8');
    }
    const runner = [
      'class Storage {',
      '  constructor(){this.data=new Map();}',
      '  setItem(key,value){this.data.set(String(key),String(value));}',
      '}',
      'globalThis.Storage=Storage;',
      'globalThis.localStorage=new Storage();',
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

for (const mode of ['coo', 'sco', 'sno']) {
  test('cross-file WeakMap container bypass preserves an unsafe identifier rewrite in ' + mode.toUpperCase(), () => {
    const compiled = obfuscateFiles(sourceFiles, {
      mode,
      seed: 'agent3-weakmap-cross-file-container-' + mode,
      properties: false,
      identifiers: true,
      strings: false,
      closedWorld: true
    });
    const storage = compiled.files.find(file => file.path === 'storage.mjs');
    assert.ok(storage);
    const evidence = {
      mode,
      metrics: storage.metrics,
      files: compiled.files.map(file => ({ path: file.path, metrics: file.metrics }))
    };
    assert.ok(storage.metrics.bindings > 0, JSON.stringify(evidence));
    if (mode === 'coo') {
      const native = run(sourceFiles.map(file => ({ path: file.path, code: file.code })));
      const emitted = run(compiled.files.map(file => ({
        path: file.path,
        code: String(file.code)
      })));
      assert.deepEqual(emitted.result, native.result);
      assert.ok(native.capturedSource.includes('privateLocal'), JSON.stringify({ native, emitted }));
      assert.notEqual(emitted.capturedSource, native.capturedSource,
        JSON.stringify({ native, emitted, evidence }));
      assert.ok(!emitted.capturedSource.includes('privateLocal'),
        JSON.stringify({ native, emitted, evidence }));
      process.stdout.write('CROSS_FILE_WEAKMAP_CONTAINER_FALSE_SAFE ' + JSON.stringify({
        mode, storageMetrics: storage.metrics, native, emitted
      }) + '\n');
    }
  });
}
