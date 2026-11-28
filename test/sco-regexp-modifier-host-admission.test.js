'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports,partitionScoSelectedGraph}=require('../src');

/**
 * Node 22.16.0 rejects the ES2025 RegExp inline flag modifier while tested
 * Chromium 144 accepts it. In a relocated selected SCO body, the browser
 * does not evaluate the RegExp until it invokes the exported function.
 * @param {string} privateBody
 * @param {string} [publicBody]
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function selected(privateBody,publicBody='return 7;'){
  return partitionScoSelectedAsyncExports({
    path:'regexp-modifier-host.mjs',sourceType:'module',
    code:'export async function privateOp(pattern){'+privateBody+'}\n'+
      'export function visible(){'+publicBody+'}'
  },{privateNames:['privateOp'],seed:'sco-regexp-modifier-host-20261128'});
}

test('selected SCO rejects browser-only RegExp modifier grammar',()=>{
  const bodies=[
    "return new RegExp('(?i:abc)').test('ABC');",
    "return RegExp('(?i:abc)').test('ABC');",
    "const R=RegExp;return new R('(?i:abc)').test('ABC');",
    "const pattern='(?i:abc)';return new RegExp(pattern).test('ABC');",
    "return new RegExp(pattern).test('ABC');",
    "return new globalThis.RegExp('(?i:abc)').test('ABC');"
  ];
  for(const body of bodies){
    assert.throws(()=>selected(body),{name:'TypeError'},body);
  }
});

test('SCO refuses browser-only RegExp source in selected private ESM graph',()=>{
  assert.throws(()=>partitionScoSelectedGraph([{
    file:{path:'regex-entry.mjs',sourceType:'module',
      code:"import {leaf} from './private/leaf.mjs';"+
        "export async function privateOp(){return leaf();}"+
        "export function visible(){return 7;}"},
    options:{
      privateNames:['privateOp'],
      seed:'sco-regexp-private-20261128',
      privateModuleImports:['./private/leaf.mjs'],
      privateModuleSources:[{
        path:'private/leaf.mjs',
        code:"export function leaf(){return new RegExp('(?i:abc)').test('ABC');}"
      }]
    }
  }]),{name:'TypeError'});
});

test('SCO keeps existing safe fixed-pattern RegExp and retained browser APIs',()=>{
  const out=selected("return new RegExp('abc').test('ABC');",
    "return new RegExp('(?i:abc)').test('ABC');");
  assert.deepEqual(out.privateNames,['privateOp']);
  assert.match(out.clientFile.code,/\(\?i:abc\)/u);
});

test('SCO recognizes an owned RegExp function shadow without treating it as global',()=>{
  const out=selected(
    "function RegExp(){return {test(){return 17;}};}return RegExp().test('ABC');"
  );
  assert.deepEqual(out.privateNames,['privateOp']);
});
