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


/**
 * A hidden, but source-visible alias of the global realm can change
 * Reflect.get before its syntactically safe-looking capture occurs.
 * The resulting call returns String instead of the own primitive, and the
 * following mutation poisons a later module's eager string decoder.
 *
 * @param {string} prelude
 * @param {string} target
 * @returns {string}
 */
function runKnownSourcePair(prelude,target) {
  const context=vm.createContext({module:{exports:null}});
  vm.runInContext('(function(){\n'+prelude+'\n})()',context,{timeout:2500});
  vm.runInContext('(function(){\n'+target+'\n})()',context,{timeout:2500});
  return String(context.module.exports);
}

const preludeSource=
  "const holder={inner:{realm:globalThis}};\n"+
  "const computed='Reflect';\n"+
  "const reflectObject=holder.inner.realm[computed];\n"+
  "reflectObject.get=function(){return String;};\n"+
  "const get=Reflect.get;\n"+
  "get({known:2},'known').fromCharCode=()=>0;\n";
const targetSource="module.exports='decoder-sensitive-shared-literal';\n";

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test('known-source nested global alias may poison downstream decoder: '+mode,()=>{
    const built=obfuscateFiles([
      {path:'prelude.cjs',sourceType:'commonjs',code:preludeSource},
      {path:'target.cjs',sourceType:'commonjs',code:targetSource}
    ],{mode,seed:'known-reflect-global-container/'+mode,
       strings:true,identifiers:false,properties:false}).files;
    const prelude=String(built.find(file=>file.path==='prelude.cjs')?.code);
    const target=built.find(file=>file.path==='target.cjs');
    assert.ok(target,'Compiler must publish the intended downstream module');
    assert.ok(target.metrics.literals>0,
      'The decoder sensitivity guard must actually have allowed a rewrite');
    assert.equal(
      runKnownSourcePair(prelude,String(target.code)),
      runKnownSourcePair(preludeSource,targetSource),
      'Known source group must preserve native downstream module behavior'
    );
  });
}
