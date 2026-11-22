'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parse}=require('../src/ast');
const {firstUnprovedFreeReference}=require('../src/sco-free-references');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @type {Set<string>} */
const shared=new Set(['Math','Object','Number','String','undefined','globalThis']);

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

test('25 lexical free-reference cases separate scope from mere binding-count presence',()=>{
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
    'return typeof function(){return externalBridge;};',
    'return arguments[0];',
    'const reader=()=>arguments[0];return reader();'
  ];
  for(const body of negatives){
    assert.equal(firstUnprovedFreeReference(selectedBody(body),new Set(),
      new Set(),shared,true),'externalBridge',body);
  }
  for(const body of positives){
    assert.equal(firstUnprovedFreeReference(selectedBody(body),new Set(),
      new Set(),shared,true),null,body);
  }
  assert.equal(negatives.length+positives.length,25);
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
    'return typeof function(){return externalBridge;};',
    'return arguments[0];'
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
    'return Math.imul(6,7);',
    'return arguments[0];'
  ]){
    assert.deepEqual(audited(body).privateNames,['protectedOp'],body);
  }
});

test('SCO ordinary functions own arguments but module-level arrows do not',()=>{
  const arrow={
    path:'mixed.mjs',sourceType:'module',code:
      'export const protectedOp=async()=>{return arguments[0];};'+
      'export function visible(){return 7;}'
  };
  assert.throws(()=>partitionScoSelectedAsyncExports(arrow,{
    seed:'sco-no-arrow-arguments-20261122',privateNames:['protectedOp']
  }),/unproved free global: arguments/u);

  const privateHelper={
    path:'mixed.mjs',sourceType:'module',code:
      'const helper=()=>arguments[0];'+
      'export async function protectedOp(){return helper(7);}'+
      'export function visible(){return 7;}'
  };
  assert.throws(()=>partitionScoSelectedAsyncExports(privateHelper,{
    seed:'sco-no-arrow-helper-arguments-20261122',privateNames:['protectedOp']
  }),/unproved free global: arguments/u);

  assert.equal(firstUnprovedFreeReference(
    parse('const fn=()=>arguments[0];','module'),new Set(),new Set(),shared
  ),'arguments');

  assert.equal(firstUnprovedFreeReference(
    parse('function fn(){return (()=>arguments[0])();}','module'),
    new Set(),new Set(),shared
  ),null);
});

test('SCO confines proven Node-only global names to their trusted private contexts',()=>{
  assert.deepEqual(selected('return Buffer.from("abc","utf8").length;').privateNames,
    ['protectedOp'],'Node Buffer remains usable in selected private execution');
  assert.deepEqual(audited('return process.env.SCO_TEST_SUFFIX;').privateNames,
    ['protectedOp'],'Node process.env remains usable in server-owned static ESM');
  assert.deepEqual(audited('return Buffer.from("xyz","utf8").length;').privateNames,
    ['protectedOp'],'Node Buffer remains usable in static server-only ESM');
  assert.throws(()=>selected('return process.env.SCO_TEST_SUFFIX;'),
    /unproved free global: process/u,
    'An unapproved selected browser-to-Node ambient process read remains refused');
  assert.throws(()=>selected('return externalBridge;'),
    /unproved free global: externalBridge/u);
});

test('204 cross-product decoy and owned-binding lexical cases remain scope precise',()=>{
  const reads=[
    'return externalBridge;',
    'return ({read:externalBridge}).read;',
    'return [externalBridge][0];',
    'return (()=>externalBridge)();',
    'return (function(){return externalBridge;})();',
    'const f=(x=externalBridge)=>x;return f();',
    'const {[externalBridge]:v}={"41":1};return v;',
    'const o={[externalBridge]:1};return Object.keys(o).length;',
    'return externalBridge?.x ?? 0;',
    'return String(externalBridge);',
    'const obj={get x(){return externalBridge;}};return obj.x;',
    'const v=externalBridge;return v;'
  ];
  const decoys=[
    'function decoy(){const externalBridge=1;}',
    'const decoy=()=>{const externalBridge=1;return externalBridge;};',
    '{const externalBridge=1;}',
    'if(true){let externalBridge=1;}',
    'try{throw 1;}catch(externalBridge){}',
    'for(let externalBridge=0;externalBridge<1;externalBridge++){}',
    'function decoy(externalBridge){return externalBridge;}',
    'class Decoy{static externalBridge=1;}',
    'switch(1){case 1: {const externalBridge=1;} break;}',
    'const decoy={externalBridge:1};'
  ];
  const owned=[
    'const externalBridge=41;',
    'let externalBridge=41;',
    'var externalBridge=41;',
    'function externalBridge(){return 41;}',
    'const {externalBridge}={externalBridge:41};',
    'const [externalBridge]=[41];',
    'const decoy=1;const externalBridge=decoy;'
  ];
  let cases=0;
  for(const prefix of decoys){
    for(const expression of reads){
      const body=prefix+expression;
      assert.equal(firstUnprovedFreeReference(selectedBody(body),new Set(),
        new Set(),shared,true),'externalBridge',body);
      cases++;
    }
  }
  for(const prefix of owned){
    for(const expression of reads){
      const body=prefix+expression;
      assert.equal(firstUnprovedFreeReference(selectedBody(body),new Set(),
        new Set(),shared,true),null,body);
      cases++;
    }
  }
  assert.equal(cases,204);
});
