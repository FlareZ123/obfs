'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * @param {string} body
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function selected(body){
  return partitionScoSelectedAsyncExports({
    path:'clone-root-alias.mjs',sourceType:'module',
    code:'export async function privateOp(){'+body+'}\n'+
      'export function visible(){return 7;}'
  },{privateNames:['privateOp'],seed:'clone-global-root-20261128'});
}

const sources=[
  ['direct','const r=globalThis;'],
  ['assignment','let r;r=globalThis;'],
  ['sequence','const r=(0,globalThis);'],
  ['array','const r=[globalThis][0];'],
  ['object','const r=({g:globalThis}).g;'],
  ['arrow','const r=(()=>globalThis)();'],
  ['optional','const r=globalThis?.globalThis;'],
  ['computed','const r=globalThis["global"+"This"];'],
  ['destructure','const {globalThis:r}=globalThis;'],
  ['identity','const r=((x)=>x)(globalThis);'],
  ['conditional','const r=true?globalThis:null;'],
  ['nested','const g=globalThis;const r=g;']
];

test('SCO refuses first-class structuredClone recovered from opaque global-root aliases',()=>{
  for(const [label,initial] of sources){
    const body=initial+
      "const clone=r.structuredClone;try{clone(Symbol('x'));return 'ok';}"+
      'catch(e){return e.message;}';
    assert.throws(()=>selected(body),{name:'TypeError'},label);
  }
});

test('SCO retains a locally owned record property named structuredClone',()=>{
  const output=selected(
    'const r={structuredClone:x=>({copied:true,value:x})};'+
    'const copy=r.structuredClone;return copy(7).value;'
  );
  assert.deepEqual(output.privateNames,['privateOp']);
});

test('SCO retains unrelated selected arithmetic as a nonvacuous positive',()=>{
  const output=selected('return Math.imul(11,13);');
  assert.deepEqual(output.privateNames,['privateOp']);
});
