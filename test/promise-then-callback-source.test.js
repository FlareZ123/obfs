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
    strings:true,identifiers:true,properties:true,preservePublicCallableSource:true
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

test('direct-call-only helper remains transformable under source preservation',()=>{
  const input=[
    'function privateHelper(){',
    ' const internalValue="PRIVATE_DIRECT_ONLY_CODE_MARKER_0123456789_ABCDEF";',
    ' return internalValue.length;',
    '}',
    'module.exports=privateHelper();'
  ].join('\n');
  /** @type {import('../src/core').SourceFile[]} */
  const files=[{path:'entry.cjs',sourceType:'commonjs',code:input}];
  const result=obfuscateFiles(files,{
    mode:'sno',seed:'agent44-direct-private-positive-control',
    strings:true,identifiers:true,properties:true,preservePublicCallableSource:true
  });
  const output=String(result.files[0].code);
  /** @type {{module:{exports:unknown}}} */
  const before={module:{exports:null}};
  /** @type {{module:{exports:unknown}}} */
  const after={module:{exports:null}};
  vm.runInNewContext(input,before,{timeout:1500});
  vm.runInNewContext(output,after,{timeout:1500});
  assert.equal(after.module.exports,before.module.exports);
  assert.ok(result.files[0].metrics.literals>0,
    'Conservative Promise callback protection must retain positive direct-only transforms');
});
