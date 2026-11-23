'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');
const {recoverPublicWasmExpression}=require('../sims/wasm-i32-static-recover');

/** @typedef {ReturnType<typeof obfuscateFiles>['files'][number]} OutputFile */

const expression='(((x^137)&(x>>>3))|(x<<7))';
const hiddenSource='function secretI32(x){return '+expression+';}';
const publicBody='function published(x){return secretI32(x);}';
const boundary=[-2147483648,2147483647,-1,0,1,255,-0,NaN,Infinity,-Infinity,1.5,-1.5];

/** @param {string} code @returns {(x:number)=>number} */
function loadCommonJs(code){
  const sandbox={module:{exports:null},globalThis};
  vm.runInNewContext(code,sandbox,{timeout:2000});
  return /** @type {(x:number)=>number} */(/** @type {unknown} */(sandbox.module.exports));
}

/**
 * @param {(x:number)=>number} original
 * @param {(x:number)=>number} emitted
 * @returns {number}
 */
function compareResults(original,emitted){
  let checks=0;
  for(const input of boundary){
    assert.ok(Object.is(original(input),emitted(input)),String(input));
    checks++;
  }
  for(let i=0;i<2048;i++){
    const x=(i*1664525)|0;
    assert.ok(Object.is(original(x),emitted(x)),String(x));
    checks++;
  }
  return checks;
}

/** @param {string} source @returns {Promise<(x:number)=>number>} */
async function loadEsm(source){
  const uri='data:text/javascript;base64,'+Buffer.from(source,'utf8').toString('base64');
  const ns=await import(uri);
  return /** @type {(x:number)=>number} */(ns.published);
}

test('all three modes preserve public CommonJS source while hiding a private Wasm helper',()=>{
  const original='"use strict";'+hiddenSource+publicBody+'module.exports=published;';
  const native=loadCommonJs(original);
  /** @type {{mode:string,wasmFunctions:number,sourceExact:boolean,inputs:number,recoveredBytes:number,recoveredExpression:string,recoveredInputs:number}[]} */
  const rows=[];
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const out=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:original}],{
      mode,seed:'agent38-wasm-hidden-cjs/'+mode,properties:false,
      strings:false,identifiers:false,experimentalWasmI32:{'entry.cjs':['secretI32']}
    }).files[0];
    const emitted=String(out.code);
    const fn=loadCommonJs(emitted);
    const recovered=recoverPublicWasmExpression(emitted);
    const clone=loadCommonJs('function published(x){return '+recovered.expression+';}module.exports=published;');
    rows.push({mode,wasmFunctions:out.metrics.wasmI32Functions??0,
      sourceExact:Function.prototype.toString.call(fn)===
        Function.prototype.toString.call(native),
      inputs:compareResults(native,fn),recoveredBytes:recovered.bytes,
      recoveredExpression:recovered.expression,
      recoveredInputs:compareResults(native,clone)});
    assert.ok(String(out.code).includes('WebAssembly.Module('));
  }
  console.log('WASM_PRIVATE_CJS_PUBLIC_SOURCE '+JSON.stringify(rows));
  assert.ok(rows.every(row=>row.sourceExact&&row.wasmFunctions===1&&row.inputs===2060&&
    row.recoveredBytes>25&&row.recoveredExpression.length>0&&row.recoveredInputs===2060));
});

test('all three modes preserve source of an exported ESM facade over private Wasm',async()=>{
  const original=hiddenSource+'export '+publicBody;
  const native=await loadEsm(original);
  /** @type {{mode:string,wasmFunctions:number,sourceExact:boolean,inputs:number,recoveredBytes:number,recoveredExpression:string,recoveredInputs:number}[]} */
  const rows=[];
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const out=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:original}],{
      mode,seed:'agent38-wasm-hidden-esm/'+mode,properties:false,
      strings:false,identifiers:false,experimentalWasmI32:{'entry.mjs':['secretI32']}
    }).files[0];
    const emitted=String(out.code);
    const fn=await loadEsm(emitted);
    const recovered=recoverPublicWasmExpression(emitted);
    const clone=await loadEsm('export function published(x){return '+recovered.expression+';}');
    rows.push({mode,wasmFunctions:out.metrics.wasmI32Functions??0,
      sourceExact:Function.prototype.toString.call(fn)===
        Function.prototype.toString.call(native),
      inputs:compareResults(native,fn),recoveredBytes:recovered.bytes,
      recoveredExpression:recovered.expression,
      recoveredInputs:compareResults(native,clone)});
  }
  console.log('WASM_PRIVATE_ESM_PUBLIC_SOURCE '+JSON.stringify(rows));
  assert.ok(rows.every(row=>row.sourceExact&&row.wasmFunctions===1&&row.inputs===2060&&
    row.recoveredBytes>25&&row.recoveredExpression.length>0&&row.recoveredInputs===2060));
});

test('selecting the exported callable itself for Wasm changes observable function source',()=>{
  const original='function published(x){return '+expression+';}module.exports=published;';
  const native=loadCommonJs(original);
  /** @type {{mode:string,wasmFunctions:number,sourceEqual:boolean,inputs:number}[]} */
  const rows=[];
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const out=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:original}],{
      mode,seed:'agent38-wasm-exported-source/'+mode,properties:false,
      strings:false,identifiers:false,experimentalWasmI32:{'entry.cjs':['published']}
    }).files[0];
    const fn=loadCommonJs(String(out.code));
    rows.push({mode,wasmFunctions:out.metrics.wasmI32Functions??0,
      sourceEqual:Function.prototype.toString.call(fn)===
        Function.prototype.toString.call(native),
      inputs:compareResults(native,fn)});
  }
  console.log('WASM_PUBLIC_SELECTED_SOURCE_RED '+JSON.stringify(rows));
  assert.ok(rows.every(row=>!row.sourceEqual&&row.wasmFunctions===1&&row.inputs===2060),
    'Explicitly targeting a public export is incompatible with exact source semantics');
});
