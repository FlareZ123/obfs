'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * Compile a deliberately mixed public/private ESM module.
 * @param {string} privateFunction
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function compile(privateFunction){
  return partitionScoSelectedAsyncExports({
    path:'mixed.mjs',
    sourceType:'module',
    code:privateFunction+'\nexport function visible(){return 7;}'
  },{
    seed:'sco-default-param-guard-20261122',
    privateNames:['protectedOp']
  });
}

test('selected-private default initializers are rejected before emitted RPC',()=>{
  const nonplain=[
    'export async function protectedOp(value=externalBridge){return 7;}',
    'export async function protectedOp(value=externalBridge){const externalBridge=5;return 7;}',
    'export async function protectedOp(value=externalBridge){var externalBridge=5;return 7;}',
    'export const protectedOp=async (value=externalBridge)=>7;',
    'export const protectedOp=async function(value=externalBridge){return 7;}',
    'export async function protectedOp(value=41){return 7;}',
    'export async function protectedOp({value}={value:41}){return 7;}',
    'export async function protectedOp(...values){return 7;}'
  ];
  for(const source of nonplain){
    assert.throws(()=>compile(source),/plain parameters/u,
      'Downstream RPC plain-parameter gate must fail closed: '+source);
  }
});

test('native browser/server realms differ for omitted unproved default values',async()=>{
  for(const body of [
    'async function protectedOp(value=externalBridge){return value;}',
    'async function protectedOp(value=externalBridge){var externalBridge=5;return value;}'
  ]){
    const invoke='(async()=>{'+body+'return protectedOp();})()';
    assert.equal(await vm.runInNewContext(invoke,{externalBridge:43}),43);
    await assert.rejects(vm.runInNewContext(invoke,{}),
      /externalBridge is not defined/u);
  }
});

test('plain formal parameters retain selected private yield',()=>{
  const admitted=[
    'export async function protectedOp(value){return value;}',
    'export async function protectedOp(value,other){return value+other;}',
    'export const protectedOp=async (value)=>value;',
    'export const protectedOp=async function(value){return value;}'
  ];
  for(const source of admitted){
    assert.deepEqual(compile(source).privateNames,['protectedOp'],
      'Plain formal parameter remains selected: '+source);
  }
});

test('unproved body globals still fail the scope preflight with plain parameters',()=>{
  assert.throws(()=>compile(
    'export async function protectedOp(value){return externalBridge+value;}'
  ),/unproved free global: externalBridge/u);
});
