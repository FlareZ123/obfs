'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');
const {lowerWasmI32Functions}=require('../src/wasm-i32');

const original='export function inspect(a){return a^17;}'+
  'export const view={text:performance.mark(inspect).name,value:inspect(31)};';
/** @param {string} code @returns {Promise<{text:string,value:number}>} */
async function evaluate(code) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'timing-wasm-'));
  try {
    await fs.writeFile(path.join(root,'entry.mjs'),code,'utf8');
    const loaded=await import(pathToFileURL(path.join(root,'entry.mjs')).href);
    return loaded.view;
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('native User Timing name prevents explicit selected-Wasm function replacement',async()=>{
  const native=await evaluate(original);
  assert.equal(native.value,14);
  assert.match(native.text,/inspect/);
  const lower=lowerWasmI32Functions(original,'module',{
    names:['inspect'],seed:'user-timing-native-wasm-counterfactual'
  });
  assert.equal(lower.functions,1,'Selected i32 function must be lowerable');
  const counterfactual=await evaluate(lower.code);
  assert.equal(counterfactual.value,native.value);
  assert.notEqual(counterfactual.text,native.text,
    'Selected Wasm function source is visibly different through Performance.mark');

  assert.equal(observesFunctionSource(parse(original,'module')),true,
    'Native User Timing must be recognized as a source observer');
  assert.throws(()=>obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:original
  }],{
    mode:'coo',closedWorld:true,seed:'user-timing-wasm-veto',
    identifiers:false,properties:false,strings:false,
    experimentalWasmI32:{'entry.mjs':['inspect']}
  }),/Wasm i32 requires|declined|source/i,
  'The compiler must not permit explicit source-changing Wasm under native User Timing');
});
