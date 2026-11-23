'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @param {string} caller */
function compile(caller){
  const code=[
    'import {next} from "./private/next.mjs";',
    'export async function secret(){'+caller+'}',
    'export function local(){return 1;}'
  ].join('\n');
  return partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code
  },{
    seed:'sco-standalone-private-import-identity-20261123',
    privateNames:['secret'],
    privateModuleImports:['./private/next.mjs'],
    privateModuleSources:[{
      path:'private/next.mjs',
      code:'export function next(){return 7;}'
    }]
  });
}

test('standalone selective SCO refuses direct imported function object mutation',()=>{
  assert.throws(()=>compile(
    'next.count=(next.count??0)+1;return next.count;'),
  /private imported identity escapes|shared imported member state/u);
});

test('standalone selective SCO refuses sequence-wrapped imported function mutation',()=>{
  assert.throws(()=>compile(
    'const alias=(0,next);alias.count=(alias.count??0)+1;return alias.count;'),
  /private imported identity escapes|shared imported member state/u);
});

test('standalone selective SCO refuses class-held imported function identity',()=>{
  assert.throws(()=>compile(
    'class Holder{static fn=(0,next);}return Holder.fn.count??0;'),
  /private imported identity escapes|shared imported member state/u);
});

test('standalone selective SCO still admits direct stateless imported function call',()=>{
  assert.doesNotThrow(()=>compile('return next();'));
});
