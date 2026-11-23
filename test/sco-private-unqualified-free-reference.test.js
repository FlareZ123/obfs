'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * Compile the same native private behavior either inside the selected export
 * or behind a supplied static ESM dependency. This exercises both admission
 * surfaces without pretending that a host-created global is server-owned.
 * @param {string} body
 * @param {boolean} inDependency
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function compile(body,inDependency=false){
  const entry=inDependency?
    'import {readValue} from "./private/leaf.mjs";'+
      'export async function protectedOp(){return readValue();}'+
      'export function publicOp(){return 1;}':
    'export async function protectedOp(){'+body+'}'+
      'export function publicOp(){return 1;}';
  const opts={
    seed:'agent35-lexical-free-name-20261123',
    privateNames:['protectedOp'],
    ...(inDependency?{
      privateModuleImports:['./private/leaf.mjs'],
      privateModuleSources:[{
        path:'private/leaf.mjs',
        code:'export function readValue(){'+body+'}'
      }]
    }:{})
  };
  return partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code:entry},opts);
}

test('client-owned ordinary unqualified global reads are refused in private selected and dependency code',()=>{
  const unsafe=[
    'return externalBridge;',
    'return externalBridge?.value;',
    'return externalBridge.value ?? 0;',
    'const fn=()=>externalBridge;return fn();',
    'return ({externalBridge}).externalBridge;',
    'function read(){return externalBridge;}return read();',
    'return [externalBridge][0];'
  ];
  for(const body of unsafe)for(const inDependency of [false,true]){
    assert.throws(()=>compile(body,inDependency),
      /unproved unqualified free reference/u,
      body+' / dependency='+inDependency);
  }
});

test('a same-spelled binding in an unrelated function does not prove lexical ownership',()=>{
  const unsafe='function unrelated(externalBridge){return externalBridge;}'+
    'return externalBridge;';
  for(const inDependency of [false,true]){
    assert.throws(()=>compile(unsafe,inDependency),
      /unproved unqualified free reference/u,
      'unrelated formal / dependency='+inDependency);
  }
});

test('lexically owned primitives, parameters and inert keys remain admitted',()=>{
  const safe=[
    'const externalBridge=41;return externalBridge;',
    'const obj={externalBridge:41};return obj.externalBridge;',
    'const fn=(externalBridge)=>externalBridge+1;return fn(41);',
    'const {externalBridge}=({externalBridge:41});return externalBridge;',
    'const x=11;return Math.imul(x,2);',
    'function local(x){return x+1;}return local(41);'
  ];
  for(const body of safe)for(const inDependency of [false,true]){
    const transformed=compile(body,inDependency);
    assert.deepEqual(transformed.privateNames,['protectedOp']);
    assert.doesNotMatch(transformed.clientFile.code,/externalBridge/u);
  }
});

test('explicit primitive server constants and named private imports keep positive yield',()=>{
  const source='const serverNumber=41;'+
    'export async function protectedOp(){return serverNumber+1;}'+
    'export function publicOp(){return 0;}';
  const transformed=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code:source},
    {seed:'agent35-free-name-server-binding-positive',privateNames:['protectedOp']}
  );
  assert.deepEqual(transformed.privateNames,['protectedOp']);
  assert.doesNotMatch(transformed.clientFile.code,/serverNumber/u);
});

test('selected ordinary formals and implicit arguments retain lexical ownership',()=>{
  const source='export async function protectedOp(externalBridge,next){'+
    'return externalBridge+next+arguments.length;}'+
    'export function publicOp(){return 1;}';
  const transformed=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code:source},
    {seed:'agent35-destructured-and-arguments',privateNames:['protectedOp']}
  );
  assert.deepEqual(transformed.privateNames,['protectedOp']);
  assert.doesNotMatch(transformed.clientFile.code,/externalBridge/u);
});

test('top-level async arrow cannot borrow ordinary function arguments ownership',()=>{
  const source='export const protectedOp=async ()=>arguments;'+
    'export function publicOp(){return 0;}';
  assert.throws(()=>partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code:source},
    {seed:'agent35-async-arrow-arguments',privateNames:['protectedOp']}
  ),/unproved unqualified free reference: arguments/u);
});
