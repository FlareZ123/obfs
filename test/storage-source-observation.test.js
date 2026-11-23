'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const sameFile=[
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  const key="obfs-storage-source-observer";',
  '  localStorage.setItem(key,inspect);',
  '  sessionStorage.setItem(key,inspect);',
  '  localStorage[key+"-named"]=inspect;',
  '  return {local:localStorage.getItem(key),session:sessionStorage.getItem(key),',
  '    named:localStorage.getItem(key+"-named"),',
  '    value:inspect(),independent:independent()};',
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
  assert.ok(result.files[0].metrics.bindings>=2);
  assert.ok(!output.includes('privateLocal'));
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
