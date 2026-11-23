'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const source=[
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  const key="obfs-storage-source-observer";',
  '  localStorage.setItem(key,inspect);',
  '  sessionStorage.setItem(key,inspect);',
  '  return {local:localStorage.getItem(key),session:sessionStorage.getItem(key),',
  '    value:inspect(),independent:independent()};',
  '}'
].join('\n');

test('Storage.setItem source conversion is not recognized by the source-observer scanner',()=>{
  assert.equal(observesFunctionSource(parse(source,'module')),false);
});

test('the unrecognized Storage sink permits source-changing local identifier rewrites',()=>{
  const result=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',seed:'storage-source-observation-negative',
    properties:false,identifiers:true,strings:false
  });
  const output=String(result.files[0].code);
  assert.ok(result.files[0].metrics.bindings>=2,
    'the observed function and unrelated private helper should both have rewritten bindings');
  assert.ok(!output.includes('privateLocal'),
    'the callback local should be changed by the current compiler');
  assert.ok(!output.includes('independentLocal'),
    'an unrelated private local provides a real positive-yield control');
});
