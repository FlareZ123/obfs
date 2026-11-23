'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @returns {string} */
function fixture(){
  return [
    'let capturedCallback=null;',
    'const originalThen=Promise.prototype.then;',
    'Promise.prototype.then=function intercept(cb){',
    ' capturedCallback=cb;',
    ' return {then:originalThen};',
    '};',
    'Promise.resolve().then(()=>{',
    ' const privateMarker="EXPORTED_PROMISE_CALLBACK_SOURCE_MARKER_0123456789_ABCDEF";',
    ' return privateMarker.length;',
    '});',
    'module.exports=capturedCallback;'
  ].join('\n');
}

/**
 * Run in a fully isolated CJS-like VM so the fixture can modify its own
 * Promise.prototype.then without touching the host test runner's Promise.
 * @param {string} code
 * @returns {string}
 */
function observeCallbackSource(code){
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1500});
  assert.equal(typeof context.module.exports,'function',
    'Same-file Promise.then override must capture its callback');
  return String(context.module.exports);
}

test('same-file Promise.prototype.then override exposes callback source',()=>{
  const source=fixture();
  const native=observeCallbackSource(source);
  assert.match(native,/EXPORTED_PROMISE_CALLBACK_SOURCE_MARKER_0123456789_ABCDEF/);
  /** @type {import('../src/core').SourceFile[]} */
  const files=[{path:'entry.cjs',sourceType:'commonjs',code:source}];
  const result=obfuscateFiles(files,{
    mode:'sno',seed:'agent44-monkeypatched-promise-then',
    strings:true,identifiers:true,properties:true
  });
  const file=result.files[0];
  assert.ok(file);
  const emitted=String(file.code);
  const after=observeCallbackSource(emitted);
  process.stdout.write('PROMISE_THEN_SOURCE_PROBE '+JSON.stringify({
    nativeLength:native.length,emittedLength:after.length,
    changed:emitted!==source,
    literals:file.metrics.literals,bindings:file.metrics.bindings,
    before:native,after
  })+'\n');
  assert.equal(after,native,
    'Same-source Promise prototype monkey patch must preserve exported callback source');
});
