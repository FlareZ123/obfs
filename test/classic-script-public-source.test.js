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
