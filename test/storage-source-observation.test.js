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

const logic=[
  'export function inspect(){const privateLocal=31;return privateLocal;}',
  'export function independent(){const independentLocal=7;return independentLocal;}'
].join('\n');
const observer=[
  'import {inspect,independent} from "./logic.mjs";',
  'export function sample(){',
  '  const key="obfs-storage-cross-file";',
  '  localStorage.setItem(key,inspect);',
  '  sessionStorage.setItem(key,inspect);',
  '  localStorage[key+"-named"]=inspect;',
  '  return {local:localStorage.getItem(key),session:sessionStorage.getItem(key),',
  '    named:localStorage.getItem(key+"-named"),',
  '    value:inspect(),independent:independent()};',
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

test('a Storage observer in another ESM file is not propagated to the exporting module',()=>{
  assert.equal(observesFunctionSource(parse(logic,'module')),false);
  assert.equal(observesFunctionSource(parse(observer,'module')),false);
  const result=obfuscateFiles([
    {path:'logic.mjs',sourceType:'module',code:logic},
    {path:'observer.mjs',sourceType:'module',code:observer}
  ],{
    mode:'coo',seed:'storage-source-observation-cross-file',
    closedWorld:true,properties:false,identifiers:true,strings:false
  });
  const emitted=String(result.files.find(file=>file.path==='logic.mjs').code);
  assert.ok(!emitted.includes('privateLocal'),
    'the producer module rewrites a callable observed by Storage in its consumer');
  assert.ok(!emitted.includes('independentLocal'),
    'an unrelated exported helper also retains positive identifier yield');
});
