'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {mkdtempSync,writeFileSync,rmSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src/core');

const kernel='import {observed} from "./peer.mjs";\n'+
  'export function f(x){return ((x>>>1)^(x&255));}\n'+
  'export {observed};\n';
const peer='import {f} from "./kernel.mjs";\n'+
  'export const observed=[-2147483648,-1,0,1,2147483647].map(f);\n';

/**
 * A peer in the same ESM strongly connected component executes first and
 * invokes a linked, exported function before the exporter's module body runs.
 * The experiment uses distinct temporary module URLs to avoid ESM cache hits.
 * @param {string} code
 * @returns {Promise<{early:number[],later:number[]}>}
 */
async function executeCycle(code) {
  const root=mkdtempSync(path.join(os.tmpdir(),'obfs-wasm-esm-cycle-'));
  try {
    writeFileSync(path.join(root,'kernel.mjs'),code,'utf8');
    writeFileSync(path.join(root,'peer.mjs'),peer,'utf8');
    const imported=await import(pathToFileURL(path.join(root,'kernel.mjs')).href);
    return {early:imported.observed,
      later:[imported.f(-2147483648),imported.f(-1),
        imported.f(0),imported.f(1),imported.f(2147483647)]};
  } finally {
    rmSync(root,{recursive:true,force:true});
  }
}

test('experimental Wasm i32 backend preserves early ESM cyclic-import calls',async()=>{
  const native=await executeCycle(kernel);
  const lowered=lowerWasmI32Functions(kernel,'module',{
    seed:'hoisted-esm-cycle',names:['f']});
  assert.equal(lowered.functions,1);
  assert.match(lowered.code,/function _wi_[0-9a-f]+\(input\)\{/u);
  assert.ok(lowered.code.includes('WebAssembly.Module('));
  assert.deepEqual(await executeCycle(lowered.code),native);

  const pipeline=obfuscateFiles([
    {path:'kernel.mjs',sourceType:'module',code:kernel},
    {path:'peer.mjs',sourceType:'module',code:peer}
  ],{
    mode:'coo',seed:'hoisted-esm-cycle-pipeline',
    strings:false,properties:false,identifiers:false,
    experimentalWasmI32:{'kernel.mjs':['f']}
  });
  assert.equal(pipeline.files[0].metrics.wasmI32Functions,1);
  assert.deepEqual(await executeCycle(String(pipeline.files[0].code)),native);
});
