'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * @typedef {{writer:string,reader:string}} ConstructorWitness
 * @param {string} writer
 * @param {string} reader
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function partition(writer,reader){
  return partitionScoSelectedAsyncExports({
    path:'constructor-realm.mjs',sourceType:'module',
    code:'export async function privateOp(){'+writer+'return 1;}\n'+
      'export function publicRead(){return '+reader+';}\n'
  },{seed:'constructor-realm-20261115',privateNames:['privateOp']});
}

test('SCO refuses eight inherited constructor mutations invisible to split client realm',()=>{
  /** @type {ConstructorWitness[]} */
  const cases=[
    {writer:'const Native=({}).constructor;Native.__obfsCtorCanary=41;',
      reader:'Object.__obfsCtorCanary??0'},
    {writer:'const Native=[].constructor;Native.__obfsCtorCanary=41;',
      reader:'Array.__obfsCtorCanary??0'},
    {writer:'const Native=(0).constructor;Native.__obfsCtorCanary=41;',
      reader:'Number.__obfsCtorCanary??0'},
    {writer:'const Native="".constructor;Native.__obfsCtorCanary=41;',
      reader:'String.__obfsCtorCanary??0'},
    {writer:'const Native=/(a)/.constructor;Native.__obfsCtorCanary=41;',
      reader:'RegExp.__obfsCtorCanary??0'},
    {writer:'const Native=(function(){}).constructor;Native.__obfsCtorCanary=41;',
      reader:'Function.__obfsCtorCanary??0'},
    {writer:'const {constructor:Native}={};Native.__obfsCtorCanary=41;',
      reader:'Object.__obfsCtorCanary??0'},
    {writer:'({}).constructor.__obfsCtorCanary=41;',
      reader:'Object.__obfsCtorCanary??0'}
  ];
  for(const {writer,reader} of cases){
    const original=vm.createContext({});
    const client=vm.createContext({});
    assert.equal(vm.runInContext(writer+';'+reader,original),41,writer);
    assert.equal(vm.runInContext(reader,client),0,writer);
    assert.throws(()=>partition(writer,reader),/realm-local intrinsic state/i,writer);
  }
});

test('SCO retains own local constructor-valued data reads',()=>{
  const p=partition('const x={constructor:7};return x.constructor;',
    '({constructor:1}).constructor');
  assert.ok(p.clientFile.code.includes('constructor:1'));
  assert.deepEqual(p.privateNames,['privateOp']);
});
