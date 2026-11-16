'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src/core');
const {recoverPublicWasmExpression}=require('../sims/wasm-i32-static-recover');

const heavy='((((b^c)^(d<<5))&((b|d)^(c>>>3)))^'+
  '((((d^b)&(c|7))<<(b&7))|((c^d)>>>2)))';
const kernel='import "./peer.mjs";\n'+
  'export function f(a,b,c,d){return (a?'+heavy+':d);}\n';
const peer='import {f} from "./kernel.mjs";\n'+
  'export const observed=['+
  '[0,-2147483648,0,1],'+
  '[1,-2147483648,12345,2147483647],'+
  '[-1,-1,0,0],'+
  '[0,123456,54321,-1],'+
  '[2147483647,1,31,0]'+
  '].map(values=>f(...values));\n';

/**
 * Execute a cycle whose peer invokes the hoisted export before its owner
 * module's top-level declarations have executed.
 * @param {string} ownerCode
 * @returns {Promise<{early:number[],later:number[]}>}
 */
async function cycle(ownerCode){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-wasm-multi-cycle-'));
  try{
    await atomicWrite(path.join(folder,'kernel.mjs'),ownerCode);
    await atomicWrite(path.join(folder,'peer.mjs'),peer);
    const owner=await import(pathToFileURL(path.join(folder,'kernel.mjs')).href);
    const imported=await import(pathToFileURL(path.join(folder,'peer.mjs')).href);
    const later=[
      owner.f(0,-2147483648,3,2147483647),
      owner.f(7,17,31,47),
      owner.f(-7,17,-31,-47),
      owner.f(0,-1,2,-3)
    ];
    return {early:imported.observed,later};
  }finally{
    await fs.rm(folder,{recursive:true,force:true});
  }
}

test('four-parameter Wasm structured-if survives a real early ESM cyclic import',{
  timeout:60000
},async()=>{
  const baseline=await cycle(kernel);
  for(let seed=0;seed<4;seed++){
    const emitted=lowerWasmI32Functions(kernel,'module',{
      seed:'multi-if-cycle-'+seed,names:['f']
    });
    assert.equal(emitted.functions,1);
    assert.match(emitted.code,/function _wi_[0-9a-f]+\(input0,input1,input2,input3\)\{/u);
    assert.ok(emitted.code.includes('WebAssembly.Module('));
    const recovered=recoverPublicWasmExpression(emitted.code,['a','b','c','d']);
    assert.ok(recovered.expression.includes('?'));
    assert.deepEqual(await cycle(emitted.code),baseline);
  }
  const built=obfuscateFiles([
    {path:'kernel.mjs',sourceType:'module',code:kernel},
    {path:'peer.mjs',sourceType:'module',code:peer}
  ],{
    mode:'coo',seed:'multi-if-cycle-coo',strings:false,
    properties:false,identifiers:false,
    experimentalWasmI32:{'kernel.mjs':['f']}
  });
  assert.equal(built.files.find(file=>file.path==='kernel.mjs')?.metrics.wasmI32Functions,1);
  const compiledOwner=built.files.find(file=>file.path==='kernel.mjs');
  assert.ok(compiledOwner);
  assert.deepEqual(await cycle(String(compiledOwner.code)),baseline);
});
