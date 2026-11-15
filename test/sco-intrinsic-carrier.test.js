'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * @param {string} privateBody
 * @param {string} [publicBody]
 */
function partition(privateBody,publicBody='return Math.__obfsCarrierCanary??0;'){
  return partitionScoSelectedAsyncExports({
    path:'carrier.mjs',sourceType:'module',
    code:'export async function privateOp(){'+privateBody+'}\n'+
      'export function publicRead(){'+publicBody+'}\n'
  },{privateNames:['privateOp'],seed:'carrier-realm-20261115'});
}

test('SCO cannot relocate built-in identity mutation hidden inside containers',()=>{
  const writes=[
    'const box=[Math];box[0].__obfsCarrierCanary=41;',
    'const box=[globalThis.Math];box[0].__obfsCarrierCanary=41;',
    'const box=[globalThis];box[0].Math.__obfsCarrierCanary=41;',
    'const box={native:Math};box.native.__obfsCarrierCanary=41;',
    'const box=[JSON];box[0].__obfsCarrierCanary=41;',
    'const write=Object.assign;write(Math,{__obfsCarrierCanary:41});',
    'const bounce=x=>x;bounce(Math).__obfsCarrierCanary=41;'
  ];
  for(const write of writes){
    const root=write.includes('JSON')?'JSON':'Math';
    const reader=root+'.__obfsCarrierCanary??0';
    const original=vm.createContext({});
    const migrated=vm.createContext({});
    assert.equal(vm.runInContext(write+';'+reader,original),41,write);
    assert.equal(vm.runInContext(reader,migrated),0,write);
    assert.throws(()=>partition(write+'return 1;','return '+reader+';'),
      /realm-local intrinsic state/i,write);
  }
});

test('SCO admits direct read-only intrinsic accesses after carrier refusal',()=>{
  const result=partition('const Native=Math;return Native.imul(3,7);',
    'return Math.PI+Number.MAX_SAFE_INTEGER;');
  assert.deepEqual(result.privateNames,['privateOp']);
  assert.deepEqual(result.publicNames,['publicRead']);
  assert.ok(result.clientFile.code.includes('Math.PI'));
});
