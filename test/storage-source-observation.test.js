'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const sameFile=[
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function inspectWindow(){const windowLocal=37;return windowLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  localStorage.clear();sessionStorage.clear();',
  '  const key="obfs-storage-source-observer";',
  '  localStorage.setItem(key,inspect);',
  '  localStorage.setItem(inspect,"key-marker");',
  '  sessionStorage.setItem(key,inspect);',
  '  localStorage[key+"-named"]=inspect;',
  '  window.name=inspectWindow;',
  '  return {local:localStorage.getItem(key),session:sessionStorage.getItem(key),',
  '    named:localStorage.getItem(key+"-named"),windowName:window.name,',
  '    value:inspect(),windowValue:inspectWindow(),independent:independent()};',
  '}'
].join('\n');

const logic='export function inspect(){const privateLocal=31;return privateLocal;}';
const observer=[
  'import {inspect} from "./logic.mjs";',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  const key="obfs-storage-cross-file-control";',
  '  localStorage.setItem(key,inspect);',
  '  return {source:localStorage.getItem(key),value:inspect(),independent:independent()};',
  '}'
].join('\n');

test('Storage.setItem source conversion is not recognized by the source-observer scanner',()=>{
  assert.equal(observesFunctionSource(parse(sameFile,'module')),false);
});

test('the unrecognized same-file Storage sink permits source-changing local identifier rewrites',()=>{
  const result=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:sameFile}],{
    mode:'coo',seed:'storage-source-observation-negative',
    properties:false,identifiers:true,strings:false
  });
  const output=String(result.files[0].code);
  assert.ok(result.files[0].metrics.bindings>=3);
  assert.ok(!output.includes('privateLocal'));
  assert.ok(!output.includes('windowLocal'));
  assert.ok(!output.includes('independentLocal'));
});

test('exported cross-file callable stays source-stable while unrelated consumer helper retains yield',()=>{
  assert.equal(observesFunctionSource(parse(logic,'module')),false);
  assert.equal(observesFunctionSource(parse(observer,'module')),false);
  const result=obfuscateFiles([
    {path:'logic.mjs',sourceType:'module',code:logic},
    {path:'observer.mjs',sourceType:'module',code:observer}
  ],{
    mode:'coo',seed:'storage-source-observation-cross-file-control',
    closedWorld:true,properties:false,identifiers:true,strings:false
  });
  const producer=String(result.files.find(file=>file.path==='logic.mjs').code);
  const consumer=String(result.files.find(file=>file.path==='observer.mjs').code);
  assert.equal(producer,logic,
    'the exported producer callable is currently kept source-stable');
  assert.ok(!consumer.includes('independentLocal'),
    'the unrelated unexported consumer helper retains identifier yield');
});

const shadowedHostNames=[
  'const localStorage={setItem(_key,_value){}};',
  'const window={name:""};',
  'function inspect(){const shadowLocal=43;return shadowLocal;}',
  'function inspectWindow(){const shadowWindow=47;return shadowWindow;}',
  'localStorage.setItem("key",inspect);',
  'window.name=inspectWindow;',
  'export function sample(){return inspect()+inspectWindow();}'
].join('\n');

test('shadowed localStorage and window bindings are not browser source-observer sinks',()=>{
  assert.equal(observesFunctionSource(parse(shadowedHostNames,'module')),false);
  const result=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:shadowedHostNames}],{
    mode:'coo',seed:'storage-window-shadowed-positive-control',
    properties:false,identifiers:true,strings:false
  });
  const output=String(result.files[0].code);
  assert.ok(!output.includes('shadowLocal'));
  assert.ok(!output.includes('shadowWindow'));
});

const primitiveStorage=[
  'function independent(){const primitiveLocal=53;return primitiveLocal;}',
  'export function sample(){',
  '  const key="primitive-storage-control";',
  '  localStorage.setItem(key,"literal");',
  '  sessionStorage.setItem(key,7);',
  '  window.name="literal-window-name";',
  '  return independent();',
  '}'
].join('\n');

test('primitive Storage and Window.name values retain unrelated identifier yield',()=>{
  assert.equal(observesFunctionSource(parse(primitiveStorage,'module')),false);
  const result=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:primitiveStorage}],{
    mode:'coo',seed:'storage-window-primitive-positive-control',
    properties:false,identifiers:true,strings:false
  });
  const output=String(result.files[0].code);
  assert.ok(result.files[0].metrics.bindings>=1);
  assert.ok(!output.includes('primitiveLocal'));
});


const overriddenStorage=[
  'const nativeSetItem=Storage.prototype.setItem;',
  'Storage.prototype.setItem=function(_key,_value){};',
  'function inspect(){const overrideLocal=59;return overrideLocal;}',
  'localStorage.setItem("overridden-storage",inspect);',
  'Storage.prototype.setItem=nativeSetItem;',
  'export function sample(){return inspect();}'
].join('\\n');

test('overridden Storage.prototype.setItem is not mistaken for native DOMString conversion',()=>{
  assert.equal(observesFunctionSource(parse(overriddenStorage,'module')),false);
  const result=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:overriddenStorage}],{
    mode:'coo',seed:'storage-overridden-method-control',
    properties:false,identifiers:true,strings:false
  });
  assert.ok(!String(result.files[0].code).includes('overrideLocal'));
});
