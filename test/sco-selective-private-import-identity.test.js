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

test('standalone selective SCO retains safe sequence alias direct-call coverage',()=>{
  assert.doesNotThrow(()=>compile('const fn=(0,next);return fn();'));
});

test('standalone selective SCO retains primitive private-import alias coverage',()=>{
  const code=[
    'import {salt} from "./private/salt.mjs";',
    'export async function secret(){const copied=salt;return copied+1;}',
    'export function local(){return 1;}'
  ].join('\n');
  assert.doesNotThrow(()=>partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code
  },{
    seed:'sco-standalone-primitive-import-20261123',
    privateNames:['secret'],privateModuleImports:['./private/salt.mjs'],
    privateModuleSources:[{
      path:'private/salt.mjs',code:'export const salt=41;'
    }]
  }));
});
