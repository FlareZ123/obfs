'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Execute a CommonJS-like wrapper inside an isolated realm. An external
 * preloader can replace Reflect.get before the module evaluates; its sloppy
 * caller observer then sees the complete wrapper source, which is absent
 * from the compiler input AST.
 *
 * @param {string} code
 * @param {boolean} patched
 * @returns {string}
 */
function run(code,patched) {
  const context=vm.createContext({module:{exports:null}});
  if(patched) {
    vm.runInContext(
      'Reflect.get=function(){return arguments.callee.caller.toString();};',
      context
    );
  }
  vm.runInContext('(function(){\n'+code+'\n})()',context,{timeout:2500});
  return JSON.stringify(context.module.exports);
}

const source=
  "const get=Reflect.get;\n"+
  "function marker(){return 'source-observed-local-literal';}\n"+
  "const text='previously-proven-safe-literal';\n"+
  "module.exports={text,observed:get({known:2},'known')};\n";

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test('external Reflect.get preloader observes transformed wrapper source: '+mode,()=>{
    const transformed=obfuscateFiles(
      [{path:'capture.cjs',sourceType:'commonjs',code:source}],
      {mode,seed:'external-reflect-get-preload/'+mode,
       strings:true,identifiers:false,properties:false}
    ).files[0];
    assert.ok(transformed.metrics.literals>0,
      'Control must prove the compiler emitted an actual string rewrite');
    assert.equal(run(String(transformed.code),false),run(source,false),
      'Native Reflect.get control must retain semantics');
    assert.equal(run(String(transformed.code),true),run(source,true),
      'External preloader may inspect Function#caller source');
  });
}
