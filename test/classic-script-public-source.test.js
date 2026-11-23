'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @returns {string} */
function fixture(){
  return [
    'function scriptGlobal(){',
    ' const publicMarker="CLASSIC_SCRIPT_GLOBAL_CALLABLE_SOURCE_MARKER_0123456789_ABCDEF";',
    ' return publicMarker.length;',
    '}',
    'scriptGlobal();'
  ].join('\n');
}

/**
 * Classic script top-level function declarations are observable global
 * properties even when all lexical references are direct CallExpressions.
 * @param {string} source
 * @returns {string}
 */
function sourceOfGlobal(source){
  const context=vm.createContext({});
  vm.runInContext(source,context,{timeout:1500,filename:'classic-script.js'});
  const exposed=/** @type {Function} */(context.scriptGlobal);
  assert.equal(typeof exposed,'function','A top-level classic script function is global');
  return String(exposed);
}

test('classic browser script direct-called global function source remains observable',()=>{
  const input=fixture();
  const expected=sourceOfGlobal(input);
  assert.match(expected,/CLASSIC_SCRIPT_GLOBAL_CALLABLE_SOURCE_MARKER_0123456789_ABCDEF/);
  /** @type {import('../src/core').SourceFile[]} */
  const files=[{path:'entry.js',sourceType:'script',code:input}];
  const result=obfuscateFiles(files,{
    mode:'coo',seed:'agent44-classic-script-global-source',
    strings:true,identifiers:true,properties:true,preservePublicCallableSource:true
  });
  const file=result.files[0];
  const output=String(file.code);
  const actual=sourceOfGlobal(output);
  process.stdout.write('GLOBAL_SCRIPT_SOURCE_PROBE '+JSON.stringify({
    expected,actual,changed:output!==input,
    literals:file.metrics.literals,bindings:file.metrics.bindings
  })+'\n');
  assert.equal(actual,expected,'Classic script top-level function is public through globalThis');
});


test('classic script nested IIFE helper remains transformable when source cannot escape',()=>{
  const source=[
    '(function(){',
    ' function privateHelper(){',
    '  const privateValue="CLASSIC_SCRIPT_PRIVATE_NESTED_SOURCE_MARKER_0123456789_ABCDEF";',
    '  return privateValue.length;',
    ' }',
    ' globalThis.answer=privateHelper();',
    '})();'
  ].join('\n');
  /** @type {import('../src/core').SourceFile[]} */
  const files=[{path:'private-entry.js',sourceType:'script',code:source}];
  const result=obfuscateFiles(files,{
    mode:'coo',seed:'agent44-classic-script-private-positive',
    strings:true,identifiers:true,properties:true,preservePublicCallableSource:true
  });
  const output=String(result.files[0].code);
  const originalContext=vm.createContext({});
  const emittedContext=vm.createContext({});
  vm.runInContext(source,originalContext,{timeout:1500});
  vm.runInContext(output,emittedContext,{timeout:1500});
  assert.equal(emittedContext.answer,originalContext.answer);
  assert.ok(result.files[0].metrics.literals>0,
    'Actually private nested helper must still allow positive string transformation');
});


test('CommonJS top-level direct-call helper remains private despite Acorn script grammar',()=>{
  const source=[
    'function privateCommonJS(){',
    ' const privateValue="COMMONJS_PRIVATE_TOPLEVEL_LITERAL_MARKER_0123456789_ABCDEF";',
    ' return privateValue.length;',
    '}',
    'module.exports=privateCommonJS();'
  ].join('\n');
  /** @type {import('../src/core').SourceFile[]} */
  const files=[{path:'entry.cjs',sourceType:'commonjs',code:source}];
  const result=obfuscateFiles(files,{
    mode:'sno',seed:'agent44-commonjs-distinct-from-script',
    strings:true,identifiers:true,properties:true,preservePublicCallableSource:true
  });
  const inputContext=vm.createContext({module:{exports:null}});
  const emittedContext=vm.createContext({module:{exports:null}});
  vm.runInContext(source,inputContext,{timeout:1500});
  vm.runInContext(String(result.files[0].code),emittedContext,{timeout:1500});
  assert.equal(emittedContext.module.exports,inputContext.module.exports);
  assert.ok(result.files[0].metrics.literals>0,
    'CommonJS top-level direct-only function should remain transformable');
});
