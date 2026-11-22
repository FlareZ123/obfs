'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @typedef {{path:string,code:string}} PrivateSource */

/**
 * @param {string} body
 * @param {0|1|2} depth
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function compile(body,depth){
  const direct=depth===0;
  const code=direct?
    'export async function protectedOp(){'+body+'}export function visible(){return 7;}' :
    'import {read} from "./private/engine.mjs";'+
      'export async function protectedOp(){return read();}'+
      'export function visible(){return 7;}';
  /** @type {PrivateSource[]} */
  const privateModuleSources=[];
  if(depth>0){
    privateModuleSources.push({
      path:'private/engine.mjs',
      code:depth===1?'export async function read(){'+body+'}':
        'import {leaf} from "./deep/leaf.mjs";'+
          'export async function read(){return leaf();}'
    });
    if(depth===2)privateModuleSources.push({
      path:'private/deep/leaf.mjs',
      code:'export async function leaf(){'+body+'}'
    });
  }
  return partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code},
    {
      seed:'sco-native-blob-newline-20261122',
      privateNames:['protectedOp'],
      ...(direct?{}:{
        privateModuleImports:['./private/engine.mjs'],
        privateModuleSources
      })
    }
  );
}

test('Blob endings native follows actual Node host platform',async()=>{
  const text=await new Blob(['alpha\nomega'],{endings:'native'}).text();
  const expected=process.platform==='win32'?'alpha\r\nomega':'alpha\nomega';
  console.log(JSON.stringify({platform:process.platform,nativeBlobText:text,expected}));
  assert.equal(text,expected);
});

test('SCO declines Blob native newline host variation across platforms',()=>{
  const unsafe=[
    'return await new Blob(["alpha\\nomega"],{endings:"native"}).text();',
    'const value=new Blob(["alpha\\nomega"],{endings:"native"});return value.size;',
    'const NativeBlob=Blob;return await new NativeBlob(["alpha\\nomega"],{endings:"native"}).text();',
    'const options={endings:"native"};return await new Blob(["alpha\\nomega"],options).text();'
  ];
  /** @type {string[]} */
  const admitted=[];
  for(const body of unsafe)for(const depth of /** @type {const} */ ([0,1,2])){
    try{
      compile(body,depth);
      admitted.push('depth='+depth+' / '+body);
    }catch(error){
      assert.ok(error instanceof Error);
    }
  }
  console.log('SCO Blob native newline admissions='+JSON.stringify({
    tested:unsafe.length*3,admitted
  }));
  assert.deepEqual(admitted,[],
    'Host-native Blob endings cannot be relocated without an OS contract');
});

test('SCO retains stable Blob transparent/default line endings',()=>{
  const safe=[
    'return await new Blob(["alpha\\nomega"],{endings:"transparent"}).text();',
    'return await new Blob(["alpha\\nomega"]).text();',
    'return new Blob(["a","b"]).size;'
  ];
  /** @type {string[]} */
  const refused=[];
  for(const body of safe)for(const depth of /** @type {const} */ ([0,1,2])){
    try{
      const partition=compile(body,depth);
      assert.deepEqual(partition.privateNames,['protectedOp']);
    }catch(error){
      refused.push('depth='+depth+' / '+body+' / '+String(error));
    }
  }
  console.log('SCO stable Blob positives='+JSON.stringify({
    tested:safe.length*3,refused
  }));
  assert.deepEqual(refused,[]);
});
