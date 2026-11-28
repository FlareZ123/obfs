'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports,partitionScoSelectedGraph}=require('../src');

/**
 * @param {string} body
 * @param {string} [publicBody]
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function selected(body,publicBody='return 7;'){
  return partitionScoSelectedAsyncExports({
    path:'encoder-realm.mjs',
    sourceType:'module',
    code:'export async function privateOp(){'+body+'}\n'+
      'export function visible(){'+publicBody+'}'
  },{privateNames:['privateOp'],seed:'encoder-cross-host-20261128'});
}

test('SCO must not relocate TextEncoder.encodeInto unproved WebIDL source conversion',()=>{
  for(const body of [
    'const dst=new Uint8Array(8);return new TextEncoder().encodeInto(null,dst).written;',
    'const dst=new Uint8Array(8);return new TextEncoder().encodeInto(42,dst).written;',
    'const TE=TextEncoder;return new TE().encodeInto(null,new Uint8Array(8)).written;',
    'const item={T:TextEncoder};return new item.T().encodeInto(42,new Uint8Array(8)).written;',
    'const enc=new TextEncoder();return enc.encodeInto(null,new Uint8Array(8)).written;',
    'const {TextEncoder:TE}=globalThis;return new TE().encodeInto(42,new Uint8Array(8)).written;'
  ]){
    assert.throws(()=>selected(body),/unproved (?:cross-realm host API|host-global state)/u,body);
  }
});

test('SCO must screen selected transitive private TextEncoder uses',()=>{
  assert.throws(()=>partitionScoSelectedGraph([{
    file:{
      path:'encoder-entry.mjs',
      sourceType:'module',
      code:"import {leaf} from './private/leaf.mjs';"+
        'export async function privateOp(){return leaf();}'+
        'export function visible(){return 7;}'
    },
    options:{
      privateNames:['privateOp'],
      seed:'encoder-cross-host-leaf-20261128',
      privateModuleImports:['./private/leaf.mjs'],
      privateModuleSources:[{
        path:'private/leaf.mjs',
        code:'export function leaf(){return new TextEncoder().encodeInto(null,new Uint8Array(8)).written;}'
      }]
    }
  }]),/unproved cross-realm host API/u);
});

test('SCO keeps unrelated private arithmetic and browser-side encoder source',()=>{
  const out=selected('return Math.imul(7,17);',
    'return new TextEncoder().encodeInto(null,new Uint8Array(8)).written;');
  assert.deepEqual(out.privateNames,['privateOp']);
  assert.match(out.clientFile.code,/new TextEncoder\(\)\.encodeInto\(null,new Uint8Array\(8\)\)/u);
});

test('SCO preserves direct immediate local TextEncoder function shadow',()=>{
  const out=selected('function TextEncoder(){return {encodeInto(){return {written:5};}};}'+
    'return new TextEncoder().encodeInto(null,{}).written;');
  assert.deepEqual(out.privateNames,['privateOp']);
});
