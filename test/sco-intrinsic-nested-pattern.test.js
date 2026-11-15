'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * @typedef {{writer:string,reader:string}} NestedCase
 * @param {string} writer
 * @param {string} reader
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function partition(writer,reader) {
  const code='export async function privateOp(){'+writer+'return 1;}\n'+
    'export function publicRead(){return '+reader+';}\n';
  return partitionScoSelectedAsyncExports(
    {path:'nested-intrinsic.mjs',code,sourceType:'module'},
    {seed:'nested-intrinsic-20261115',privateNames:['privateOp']});
}

test('SCO refuses nested/defaulted intrinsic destructuring with actual cross-realm mutation',()=>{
  /** @type {NestedCase[]} */
  const cases=[
    {
      writer:'const {Math:{random:r}}=globalThis;r.__obfsNestedCanary=41;',
      reader:'Math.random.__obfsNestedCanary??0'
    },{
      writer:'const {Math:Native={}}=globalThis;Native.__obfsNestedCanary=41;',
      reader:'Math.__obfsNestedCanary??0'
    },{
      writer:"const root=globalThis;const {'JSON':{stringify:encoder}}=root;encoder.__obfsNestedCanary=41;",
      reader:'JSON.stringify.__obfsNestedCanary??0'
    },{
      writer:"const {'RegExp':{prototype:rxProto}}=globalThis;rxProto.__obfsNestedCanary=41;",
      reader:'RegExp.prototype.__obfsNestedCanary??0'
    }
  ];
  for(const {writer,reader} of cases){
    const native=vm.createContext({});
    const split=vm.createContext({});
    assert.equal(vm.runInContext(writer+';'+reader,native),41,writer);
    assert.equal(vm.runInContext(reader,split),0,writer);
    assert.throws(()=>partition(writer,reader),/realm-local intrinsic state/i,writer);
  }
});

test('SCO still admits flat intrinsic destructuring read-only control',()=>{
  const result=partition('const {Math:Native}=globalThis;return Native.PI;',
    'Math.PI>3');
  assert.deepEqual(result.privateNames,['privateOp']);
  assert.ok(result.clientFile.code.includes('Math.PI>3'));
});
