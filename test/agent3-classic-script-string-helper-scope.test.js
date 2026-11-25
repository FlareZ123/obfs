'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

test('classic-script lazy string helper must not create a global extraction surface',()=>{
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
  assert.ok(helperMatch,'strings=true should either refuse classic scripts or emit a decoder helper');
  const helperName=helperMatch[1];

  const nativeContext=vm.createContext({});
  vm.runInContext('const '+helperName+'=123;',nativeContext);
  vm.runInContext(source,nativeContext);
  assert.equal(nativeContext.result,message);

  const collisionContext=vm.createContext({});
  vm.runInContext('const '+helperName+'=123;',collisionContext);
  assert.throws(()=>vm.runInContext(emitted,collisionContext),/already been declared/,
    'a prior page script lexical binding must not make the obfuscated classic script fail to load');

  const extractionContext=vm.createContext({});
  vm.runInContext(emitted,extractionContext);
  assert.equal(extractionContext.result,message);
  const exposedHelper=extractionContext[helperName];
  assert.equal(typeof exposedHelper,'function',
    'classic-script top-level function declarations are exposed on the global object');
  assert.ok(Array.isArray(exposedHelper.c),
    'the helper must not publish its decoded cache on a page-visible global function');
  assert.equal(exposedHelper.c[0],message,
    'the first decoded string is directly recoverable from the exposed global cache');
});
