'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * Compile one selected private async export and one independently retained
 * public export. No private server-global option is intentionally enabled.
 *
 * @param {string} body
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function compile(body){
  return partitionScoSelectedAsyncExports({
    path:'typeof-callback.mjs',
    sourceType:'module',
    code:'export async function protectedOp(){'+body+'}\n'+
      'export function visible(){return 7;}\n'
  },{seed:'typeof-callback-host-20261128',privateNames:['protectedOp']});
}

test('unqualified Node process is not a portable browser binding when an Array callback runs',async()=>{
  const body='return typeof [0].map(()=>process)[0];';
  const runningInNode=Function('return (async function(){'+body+'})()');
  assert.equal(await runningInNode(),'object');
  const inIndependentRealm=vm.runInNewContext('(async function(){'+body+'})()',{});
  await assert.rejects(inIndependentRealm,{name:'ReferenceError'});
});

test('selected SCO must reject free process reached by callback evaluation inside typeof',()=>{
  // The typeof operator only suppresses an unresolved identifier error for
  // its immediate Identifier operand. The map/flatMap/filter callback is
  // actually invoked before typeof can form its resulting primitive tag.
  // A guard treating every nested function body as inert can miss this.
  for(const body of [
    'return typeof [0].map(()=>process)[0];',
    'return typeof [0].flatMap(()=>[process])[0];',
    'return typeof [0].filter(()=>Boolean(process))[0];',
    'return typeof ({get value(){return process;}}).value;'
  ]){
    assert.throws(()=>compile(body),/unproved|host|realm|browser/i,body);
  }
});

test('callback host guard leaves non-reading and locally owned primitives usable',()=>{
  for(const body of [
    'return typeof [0].map(()=>7)[0];',
    'return typeof ({get value(){return 7;}}).value;',
    'return typeof (()=>process);',
    'const process=7;return typeof [0].map(()=>process)[0];'
  ]){
    assert.deepEqual(compile(body).privateNames,['protectedOp'],body);
  }
});
