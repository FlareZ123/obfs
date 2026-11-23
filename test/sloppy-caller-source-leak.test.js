'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @returns {string} */
function fixture(){
  return [
    'let capturedCaller=null;',
    'function spy(){capturedCaller=spy.caller;}',
    'function apparentlyPrivate(){',
    ' const marker="SLOPPY_FUNCTION_CALLER_EXPOSED_SOURCE_MARKER_0123456789_ABCDEF";',
    ' spy();',
    ' return marker.length;',
    '}',
    'const result=apparentlyPrivate();',
    'module.exports=[result,capturedCaller];'
  ].join('\n');
}

/**
 * Execute sloppy-mode CJS in an isolated realm, returning exact observable
 * source from the function reference obtained by Function#caller.
 * @param {string} code
 * @returns {[number,string]}
 */
function observe(code){
  /** @type {{module:{exports:unknown}}} */
  const state={module:{exports:null}};
  vm.runInNewContext(code,state,{timeout:1500,filename:'sloppy-caller-source.cjs'});
  const output=/** @type {[number,Function]} */(state.module.exports);
  assert.ok(Array.isArray(output));
  assert.equal(typeof output[0],'number');
  assert.equal(typeof output[1],'function','Legacy caller must return the invoked function object');
  return [output[0],String(output[1])];
}

test('sloppy Function#caller exposes source of lexical direct-only callee',()=>{
  const source=fixture();
  const native=observe(source);
  assert.match(native[1],/SLOPPY_FUNCTION_CALLER_EXPOSED_SOURCE_MARKER_0123456789_ABCDEF/);
  /** @type {import('../src/core').SourceFile[]} */
  const files=[{path:'entry.cjs',sourceType:'commonjs',code:source}];
  const result=obfuscateFiles(files,{
    mode:'sno',seed:'agent44-sloppy-callsite-caller',
    strings:true,identifiers:true,properties:true,preservePublicCallableSource:true
  });
  const file=result.files[0];
  const output=String(file.code);
  const emitted=observe(output);
  process.stdout.write('SLOPPY_CALLER_SOURCE_PROBE '+JSON.stringify({
    originals:native,emitted,changed:output!==source,
    literals:file.metrics.literals,bindings:file.metrics.bindings
  })+'\n');
  assert.deepEqual(emitted,native,'Function#caller must not expose a renamed direct-call-only body');
});
