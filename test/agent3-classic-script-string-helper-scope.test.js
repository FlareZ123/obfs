'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

function buildClassicOutput() {
  const message='classic browser script decoder payload that should not be exposed as a global cache';
  const source='const message='+JSON.stringify(message)+';globalThis.result=message;';
  const output=obfuscateFiles([{
    path:'classic-script.js',sourceType:'script',code:source
  }],{
    mode:'coo',closedWorld:true,seed:'classic-script-helper-global-surface',
    properties:false,identifiers:false,strings:true
  });
  const emitted=String(output.files[0].code);
  const helperMatch=emitted.match(/function\s+([A-Za-z_$][\w$]*)\(i\)\{/);
  return {message,source,emitted,helperName:helperMatch?.[1]??null};
}

test('classic-script string encoding must not collide with a prior global lexical binding',()=>{
  const {message,source,emitted,helperName}=buildClassicOutput();
  if(!helperName){
    assert.equal(emitted,source,'if the classic-script helper is disabled, the original source must remain unchanged');
    return;
  }
  const nativeContext=vm.createContext({});
  vm.runInContext('const '+helperName+'=123;',nativeContext);
  vm.runInContext(source,nativeContext);
  assert.equal(nativeContext.result,message);

  const emittedContext=vm.createContext({});
  vm.runInContext('const '+helperName+'=123;',emittedContext);
  assert.doesNotThrow(()=>vm.runInContext(emitted,emittedContext),
    'a prior page-script lexical binding must not make the obfuscated script fail global declaration instantiation');
  assert.equal(emittedContext.result,message);
});

test('classic-script string decoder must not expose its decoded cache on the global object',()=>{
  const {message,source,emitted,helperName}=buildClassicOutput();
  if(!helperName){
    assert.equal(emitted,source,'if the classic-script helper is disabled, the original source must remain unchanged');
    return;
  }
  const context=vm.createContext({});
  vm.runInContext(emitted,context);
  assert.equal(context.result,message);
  assert.equal(typeof context[helperName],'undefined',
    'a page script must not be able to access the decoder through a global function binding');
});
