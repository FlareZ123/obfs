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
    seed:'sco-default-param-global-20261122',
    privateNames:['protectedOp']
  });
}

test('RED witness: selected-private defaults must not access unproved browser globals',()=>{
  const bodies=[
    'export async function protectedOp(value=externalBridge){return 7;}',
    'export async function protectedOp(value=externalBridge){const externalBridge=5;return 7;}',
    'export async function protectedOp(value=externalBridge){var externalBridge=5;return 7;}',
    'export const protectedOp=async (value=externalBridge)=>7;',
    'export const protectedOp=async function(value=externalBridge){return 7;}'
  ];
  for(const source of bodies){
    assert.throws(()=>compile(source),/unproved free global: externalBridge/u,
      'Default parameter initializer must be screened: '+source);
  }
});

test('native browser/server realms exhibit the omitted-parameter divergence',async()=>{
  for(const functionBody of [
    'async function protectedOp(value=externalBridge){return value;}',
    'async function protectedOp(value=externalBridge){var externalBridge=5;return value;}'
  ]){
    const invoke='(async()=>{'+functionBody+'return protectedOp();})()';
    assert.equal(await vm.runInNewContext(invoke,{externalBridge:43}),43);
    await assert.rejects(vm.runInNewContext(invoke,{}),
      /externalBridge is not defined/u);
  }
});

test('constant and own-parameter defaults retain legitimate private source yield',()=>{
  const good=[
    'export async function protectedOp(value=41){return value;}',
    'export async function protectedOp(value=Math.abs(-41)){return value;}',
    'const serverConstant=41;export async function protectedOp(value=serverConstant){return value;}',
    'export async function protectedOp(first=41,second=first){return second;}'
  ];
  for(const source of good){
    assert.deepEqual(compile(source).privateNames,['protectedOp'],
      'Proven server-local parameter default must remain admitted: '+source);
  }
});
