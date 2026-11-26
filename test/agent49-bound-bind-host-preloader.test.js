'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { obfuscateFiles } = require('../src');

const options = {
  mode: 'coo',
  closedWorld: true,
  seed: 'agent49-host-preloader-native-bind-assumption',
  properties: true,
  identifiers: false,
  strings: false
};

const preloader = [
  'globalThis.__capturedSource=null;',
  'globalThis.external=function(value){',
  'globalThis.__capturedSource=Function.prototype.toString.call(value);};',
  'const nativeBind=Function.prototype.bind;',
  'Function.prototype.bind=function(...args){',
  'const source=Function.prototype.toString.call(this);',
  'if(this && this.name==="internal" && source.includes("owner.")){',
  'const target=this;globalThis.external(target);',
  'Function.prototype.bind=nativeBind;',
  'return (...callArgs)=>Reflect.apply(target,args[0],callArgs);}',
  'return Reflect.apply(nativeBind,this,args);};'
].join('');

const source = 'const owner={secretField:7};' +
  'const internal=()=>owner.secretField;' +
  'const hot=internal.bind(null);' +
  'const result=hot();' +
  'process.stdout.write(JSON.stringify([globalThis.__capturedSource,result]));';

function compile(code) {
  const output = obfuscateFiles([{
    path: 'entry.mjs',
    sourceType: 'module',
    code
  }], options);
  return {
    code: /** @type {string} */ (output.files[0].code),
    properties: output.files[0].metrics.properties
  };
}

function runWithHost(code) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obfs-agent49-host-bind-'));
  try {
    const entry = path.join(root, 'entry.mjs');
    const preload = path.join(root, 'preload.cjs');
    fs.writeFileSync(entry, code);
    fs.writeFileSync(preload, preloader);
    const child = spawnSync(process.execPath, ['--require', preload, entry], {
      encoding: 'utf8',
      timeout: 8000
    });
    assert.equal(child.status, 0, child.stderr);
    return /** @type {[string,number]} */ (JSON.parse(child.stdout));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('out-of-band host bind replacement invalidates native-bind private proof', () => {
  const emitted = compile(source);
  const native = runWithHost(source);
  const transformed = runWithHost(emitted.code);

  assert.equal(native[0], '()=>owner.secretField');
  assert.equal(native[1], 7);
  assert.equal(transformed[1], 7, 'ordinary runtime result remains unchanged');
  assert.equal(emitted.properties, 0,
    'a host can replace Function.prototype.bind before module evaluation; do not admit bind as a private direct call');
  assert.equal(transformed[0], native[0],
    'the host-observable target source must remain unchanged when bind identity is not trusted');
});
