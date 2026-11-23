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

const propertySource=[
  'const privateOwner={privateField:7};',
  'function inspect(){const observedOwner={secretField:29};return observedOwner.secretField;}',
  'function independent(){return privateOwner.privateField;}',
  'export function sample(){',
  '  localStorage.setItem("property-source-observer",inspect);',
  '  return {observed:inspect(),independent:independent()};',
  '}'
].join('\n');

test('property pass keeps the Storage-observed owner stable while renaming an independent owner',()=>{
  assert.equal(observesFunctionSource(parse(propertySource,'module')),false);
  const propertyBaseline=[
    'const privateOwner={privateField:7};',
    'function independent(){return privateOwner.privateField;}',
    'export function sample(){return independent();}'
  ].join('\n');
  const baseline=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:propertyBaseline}],{
    mode:'coo',seed:'storage-property-owner-baseline',
    closedWorld:true,properties:true,identifiers:false,strings:false
  });
  assert.ok(!String(baseline.files[0].code).includes('privateField'),
    'the same private owner must be renameable without a source-observer case');
  const result=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:propertySource}],{
    mode:'coo',seed:'storage-property-owner-control',
    closedWorld:true,properties:true,identifiers:false,strings:false
  });
  const output=String(result.files[0].code);
  assert.ok(output.includes('secretField'),
    'the source-observed function owner must retain its property spelling');
  assert.ok(!output.includes('privateField'),
    'the independent private owner must retain property-renaming yield');
  assert.ok(result.files[0].metrics.properties>=1);
});
