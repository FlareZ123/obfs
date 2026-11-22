'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parse}=require('../src/ast');
const {firstUnprovedFreeReference}=require('../src/sco-free-references');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @type {Set<string>} */
const shared=new Set(['Math','Object','Number','undefined','globalThis']);

/**
 * Parse the actual ESTree body of a selected ESM function.
 * @param {string} body
 * @returns {import('../src/ast').AstNode}
 */
function selectedBody(body){
  const ast=parse('export async function protectedOp(){'+body+
    '}export function visible(){return 7;}','module');
  return ast.body[0].declaration.body;
}

test('23 lexical free-reference cases separate scope from mere binding-count presence',()=>{
  const negatives=[
    'function decoy(){const externalBridge=1;} return externalBridge;',
    'if(false){const externalBridge=1;} return externalBridge;',
    'try{throw 1;}catch(externalBridge){} return externalBridge;',
    'function nested(x=externalBridge){return x;} return nested();',
    'const {[externalBridge]:local}=Object.create(null); return local;',
    'const rec={secret:externalBridge}; return rec.secret;',
    'return ({foo:externalBridge}).foo;',
    'return externalBridge?.value;',
    'return externalBridge.value ?? 0;',
    'const fn=()=>externalBridge; return fn();'
  ];
  const positives=[
    'const externalBridge=41; return externalBridge+1;',
    'const {externalBridge}= {externalBridge:41}; return externalBridge+1;',
    'function local(externalBridge){return externalBridge+1;} return local(41);',
    'const record={externalBridge:41}; return record.externalBridge+1;',
    'return Math.imul(6,7);',
    'const fn=({externalBridge})=>externalBridge;return fn({externalBridge:1});',
    'try{throw 42;}catch(externalBridge){return externalBridge;}',
    'const record={secret:4}; const {secret:local}=record;return local;',
    'function outer(){const local=4; return ()=>local;}return outer()();',
    'const x=4; function inner(){return x;}return inner();',
    'let a=1; for (let i=0;i<3;i++)a+=i; return a;',
    'return typeof (()=>externalBridge);',
    'return typeof function(){return externalBridge;};'
  ];
  for(const body of negatives){
    assert.equal(firstUnprovedFreeReference(selectedBody(body),new Set(),
      new Set(),shared),'externalBridge',body);
  }
  for(const body of positives){
    assert.equal(firstUnprovedFreeReference(selectedBody(body),new Set(),
      new Set(),shared),null,body);
  }
  assert.equal(negatives.length+positives.length,23);
});

/** @param {string} body @returns {ReturnType<typeof partitionScoSelectedAsyncExports>} */
function selected(body){
  return partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',
    code:'export async function protectedOp(){'+body+
      '}export function visible(){return 7;}'
  },{seed:'sco-free-lexical-20261122',privateNames:['protectedOp']});
}

/** @param {string} body @returns {ReturnType<typeof partitionScoSelectedAsyncExports>} */
function audited(body){
  return partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',
    code:'import {compute} from "./private/engine.mjs";'+
      'export async function protectedOp(){return compute();}'+
      'export function visible(){return 7;}'
  },{
    seed:'sco-free-lexical-audited-20261122',
    privateNames:['protectedOp'],
    privateModuleImports:['./private/engine.mjs'],
    privateModuleSources:[{
      path:'private/engine.mjs',code:'export function compute(){'+body+'}'
    }]
  });
}

test('SCO selected export declines unproved bare globals but retains real local controls',()=>{
  for(const body of [
    'return externalBridge;',
    'return externalBridge?.value;',
    'return externalBridge.value ?? 0;',
    'function decoy(){const externalBridge=1;}return externalBridge;'
  ]){
    assert.throws(()=>selected(body),/unproved free global/u,body);
  }
  for(const body of [
    'const externalBridge=41;return externalBridge+1;',
    'const {externalBridge}={externalBridge:41};return externalBridge+1;',
    'return Math.imul(6,7);',
    'return typeof (()=>externalBridge);',
    'return typeof function(){return externalBridge;};'
  ]){
    assert.deepEqual(selected(body).privateNames,['protectedOp'],body);
  }
});

test('SCO audited graph declines unproved globals and preserves local/imported positives',()=>{
  for(const body of [
    'return externalBridge;',
    'return externalBridge?.value;',
    'function unrelated(){let externalBridge=1;}return externalBridge;'
  ]){
    assert.throws(()=>audited(body),/unproved free global/u,body);
  }
  for(const body of [
    'const externalBridge=41;return externalBridge+1;',
    'const {externalBridge}={externalBridge:41};return externalBridge+1;',
    'return Math.imul(6,7);'
  ]){
    assert.deepEqual(audited(body).privateNames,['protectedOp'],body);
  }
});
