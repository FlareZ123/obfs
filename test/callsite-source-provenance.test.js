'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @returns {string} */
function fixture(){
  return [
    'let leaked=null;',
    "const hook=['prepare','StackTrace'].join('');",
    'Error[hook]=(_error,frames)=>{leaked=frames[0].getFunction();return "stack-ok";};',
    'function privateTarget(n){',
    ' const protectedLiteral="PRIVATE_CALLSITE_FUNCTION_SOURCE_LITERAL_0123456789_ABCDEFGHIJ";',
    " const stackKey=['sta','ck'].join('');",
    ' const diagnostic=new Error();',
    ' const observed=diagnostic[stackKey];',
    ' return protectedLiteral.length+n+observed.length;',
    '}',
    'privateTarget(9);',
    'module.exports=leaked;'
  ].join('\n');
}

/**
 * Simulate actual Node CJS callback source-extraction without injecting an
 * inspector, a host debugger, a directly named stack property, or a caller
 * that has a lexical reference to privateTarget.
 * @param {string} code
 * @returns {string}
 */
function callsiteSource(code){
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1500,filename:'callsite-private.cjs'});
  assert.equal(typeof context.module.exports,'function',
    'V8 stack CallSite.getFunction must expose the actual callable');
  return String(context.module.exports);
}

test('V8 CallSite.getFunction source parity across dynamic stack property reads',()=>{
  const original=fixture();
  const native=callsiteSource(original);
  assert.match(native,/PRIVATE_CALLSITE_FUNCTION_SOURCE_LITERAL_0123456789_ABCDEFGHIJ/);
  /** @type {import('../src/core').SourceFile[]} */
  const files=[{path:'entry.cjs',sourceType:'commonjs',code:original}];
  const compiled=obfuscateFiles(files,{
    mode:'sno',seed:'agent44-callsite-source-provenance',
    strings:true,identifiers:true,properties:true
  });
  const file=compiled.files[0];
  assert.ok(file);
  const output=String(file.code);
  const observed=callsiteSource(output);
  const metrics=file.metrics;
  process.stdout.write('CALLSITE_PROBE '+JSON.stringify({
    nativeLength:native.length,emittedLength:observed.length,
    changed:output!==original,
    literalTransforms:metrics.literals,bindingTransforms:metrics.bindings,
    objectTransforms:metrics.properties,
    nativeSource:native,emittedSource:observed
  })+'\n');
  assert.equal(observed,native,'Node stack callback exposes changed private callable source');
});
