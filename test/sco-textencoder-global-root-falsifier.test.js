'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * All host-root expressions below produce the same global TextEncoder in
 * ordinary Node/browser execution; Node 22's encodeInto rejects null while
 * Chromium's WebIDL USVString conversion encodes the spelling "null".
 * Partitioning a selected private function is unsound unless the compiler
 * refuses the relocation or can prove an identical value/effect contract.
 *
 * @param {string} body
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function selected(body){
  return partitionScoSelectedAsyncExports({
    path:'encoder-global-alias.mjs',
    sourceType:'module',
    code:'export async function privateOp(){'+body+'}\n'+
      'export function visible(){return 7;}'
  },{privateNames:['privateOp'],seed:'encoder-global-alias-falsifier-20261128'});
}

const roots=[
  ['direct','const r=globalThis;'],
  ['assignment','let r;r=globalThis;'],
  ['sequence','const r=(0,globalThis);'],
  ['array','const r=[globalThis][0];'],
  ['record','const r=({g:globalThis}).g;'],
  ['immediateArrow','const r=(()=>globalThis)();'],
  ['optionalSelf','const r=globalThis?.globalThis;'],
  ['computedSelf','const r=globalThis["global"+"This"];'],
  ['destructureSelf','const {globalThis:r}=globalThis;'],
  ['identityCall','const r=((x)=>x)(globalThis);'],
  ['conditional','const r=true?globalThis:null;'],
  ['nestedAlias','const g=globalThis;const r=g;']
];

/** @param {string} initial */
function privateBody(initial){
  return initial+
    'const E=r.TextEncoder;'+
    'return new E().encodeInto(null,new Uint8Array(8)).written;';
}

test('SCO rejects all unproved global TextEncoder provenance variants',()=>{
  for(const [name,initial] of roots){
    assert.throws(()=>selected(privateBody(initial)),{
      name:'TypeError'
    },name);
  }
});

test('SCO retains unrelated selected arithmetic as nonvacuous positive yield',()=>{
  const out=selected('return Math.imul(3,11);');
  assert.deepEqual(out.privateNames,['privateOp']);
});

test('SCO retains local owned receiver property spelling',()=>{
  const out=selected(
    'const r={TextEncoder:function(){return {'+
    'encodeInto(){return {written:5};}};}};'+
    'return new r.TextEncoder().encodeInto(null,{}).written;'
  );
  assert.deepEqual(out.privateNames,['privateOp']);
});
