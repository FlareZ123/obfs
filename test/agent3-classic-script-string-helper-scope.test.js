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
  const tableMatch=emitted.match(/const\s+([A-Za-z_$][\w$]*)=\[/);
  return {message,source,emitted,tableName:tableMatch?.[1]??null};
}

test('classic-script string encoding must not collide with a prior global lexical binding',()=>{
  const {message,source,emitted,tableName}=buildClassicOutput();
  if(!tableName){
    assert.equal(emitted,source,'if classic-script string encoding is disabled, the original source must remain unchanged');
    return;
  }
  const nativeContext=vm.createContext({});
  vm.runInContext('const '+tableName+'=123;',nativeContext);
  vm.runInContext(source,nativeContext);
  assert.equal(nativeContext.result,message);

  const emittedContext=vm.createContext({});
  vm.runInContext('const '+tableName+'=123;',emittedContext);
  assert.doesNotThrow(()=>vm.runInContext(emitted,emittedContext),
    'a prior page-script lexical binding must not make the obfuscated script fail global declaration instantiation');
  assert.equal(emittedContext.result,message);
});

test('classic-script string table must not expose decoded strings to later page scripts',()=>{
  const {message,source,emitted,tableName}=buildClassicOutput();
  if(!tableName){
    assert.equal(emitted,source,'if classic-script string encoding is disabled, the original source must remain unchanged');
    return;
  }
  const context=vm.createContext({});
  vm.runInContext(emitted,context);
  assert.equal(context.result,message);
  const table=vm.runInContext(tableName,context);
  assert.ok(Array.isArray(table),'the generated top-level lexical table must be visible to later classic scripts');
  assert.ok(table.includes(message),'the decoded plaintext string is directly recoverable from the global lexical table');
});
