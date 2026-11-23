'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
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
  assert.doesNotMatch(transformed.clientFile.code,/externalBridge\+next\+arguments/u);
});

test('top-level async arrow cannot borrow ordinary function arguments ownership',()=>{
  const source='export const protectedOp=async ()=>arguments;'+
    'export function publicOp(){return 0;}';
  assert.throws(()=>partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code:source},
    {seed:'agent35-async-arrow-arguments',privateNames:['protectedOp']}
  ),/unproved unqualified free reference: arguments/u);
});


test('audited dependency checks evaluated parameter defaults before body-var bindings',()=>{
  const entry='import {leaf} from "./private/leaf.mjs";'+
    'export async function protectedOp(){return leaf();}'+
    'export function publicOp(){return 0;}';
  const leaves=[
    'export function leaf(value=externalBridge){return value;}',
    'export function leaf(value=externalBridge){var externalBridge=41;return value;}',
    'export function leaf({[externalBridge]:value}={}){return value;}',
    'export function leaf({value=externalBridge}={}){return value;}'
  ];
  for(const leaf of leaves){
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',sourceType:'module',code:entry},
      {seed:'agent35-static-dependency-evaluated-formals',privateNames:['protectedOp'],
        privateModuleImports:['./private/leaf.mjs'],
        privateModuleSources:[{path:'private/leaf.mjs',code:leaf}]}
    ),/unproved unqualified free reference/u,leaf);
  }
});

test('audited dependencies keep own catch, loop and var bindings distinct',()=>{
  const safe=[
    'try{throw 41;}catch(externalBridge){return externalBridge;}',
    'for(let externalBridge=41;externalBridge<42;externalBridge++){return externalBridge;}return 0;',
    'var externalBridge=41;return externalBridge;',
    'switch(1){case 1:{let externalBridge=41;return externalBridge;}default:return 0;}',
    'function nested(){var externalBridge=41;return externalBridge;}return nested();'
  ];
  for(const body of safe){
    const compiled=compile(body,true);
    assert.deepEqual(compiled.privateNames,['protectedOp']);
    assert.doesNotMatch(compiled.clientFile.code,/externalBridge/u);
  }
});


test('source-paired compiler-time probe: repeated reads of a hoisted local',()=>{
  // Hoisted, but deliberately not an immediate statement declaration:
  // previous lexical proof re-scanned the complete function for each read.
  const readCount=720;
  const body='let total=0;'+
    'total+=(hoisted??1);'.repeat(readCount)+
    'if(false){var hoisted=41;}return total;';
  /** @type {number[]} */
  const measurements=[];
  /** @type {string|null} */
  let outputDigest=null;
  for(let sample=0;sample<4;sample++){
    const begin=process.hrtime.bigint();
    const compiled=compile(body,false);
    measurements.push(Number(process.hrtime.bigint()-begin)/1e6);
    assert.deepEqual(compiled.privateNames,['protectedOp']);
    assert.doesNotMatch(compiled.clientFile.code,/total\+=/u);
    const sha=createHash('sha256').update(JSON.stringify({
      clientFile:compiled.clientFile,serverFile:compiled.serverFile,
      methodNames:compiled.methodNames,privateNames:compiled.privateNames,
      publicNames:compiled.publicNames
    })).digest('hex');
    if(outputDigest!==null)assert.equal(sha,outputDigest);
    outputDigest=sha;
  }
  const sorted=[...measurements].sort((a,b)=>a-b);
  console.log('SCO_LEXICAL_HOIST_CPU '+JSON.stringify({
    readCount,compilerWallMs:measurements.map(v=>Number(v.toFixed(3))),
    warmMedianMs:Number(((sorted[1]+sorted[2])/2).toFixed(3)),
    outputDigest
  }));
});


test('source-paired compiler-time probe: many distinct locally bound names',()=>{
  const count=840;
  const names=Array.from({length:count},(_,i)=>'unique'+i);
  const body=names.map((name,i)=>'const '+name+'='+i+';').join('')+
    'return '+names.join('+')+';';
  /** @type {number[]} */
  const readings=[];
  /** @type {string|null} */
  let hash=null;
  for(let i=0;i<3;i++){
    const before=process.hrtime.bigint();
    const compiled=compile(body);
    readings.push(Number(process.hrtime.bigint()-before)/1e6);
    assert.deepEqual(compiled.privateNames,['protectedOp']);
    const next=createHash('sha256').update(JSON.stringify({
      clientFile:compiled.clientFile,serverFile:compiled.serverFile,
      methodNames:compiled.methodNames,privateNames:compiled.privateNames,
      publicNames:compiled.publicNames
    })).digest('hex');
    if(hash!==null)assert.equal(next,hash);
    hash=next;
  }
  const sorted=[...readings].sort((a,b)=>a-b);
  console.log('SCO_LEXICAL_UNIQUE_CPU '+JSON.stringify({
    names:count,compilerWallMs:readings.map(x=>Number(x.toFixed(3))),
    medianMs:Number(sorted[1].toFixed(3)),outputDigest:hash
  }));
});
