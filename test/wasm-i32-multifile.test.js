'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');
const {recoverPublicWasmExpression}=require('../sims/wasm-i32-static-recover');

/** @type {Array<{path:string,sourceType:'module',code:string}>} */
const files=[
  {path:'kernel.mjs',sourceType:'module',
    code:'export function scramble(a,b,c,d){return (((a^b)&(c|d))^((a>>>d)|(c<<b)));}'},
  {path:'bridge.mjs',sourceType:'module',
    code:'export function forward(value,label){return globalThis.externalBridge.deliver(value,label);}'},
  {path:'entry.mjs',sourceType:'module',
    code:'import {scramble} from "./kernel.mjs";import {forward} from "./bridge.mjs";'+
      'export function run(a,b,c,d,label){return forward(scramble(a,b,c,d),label);}'}
];

/**
 * Materialize a reproducible ESM graph with atomic locked writes.
 * @param {string} directory
 * @param {{path:string,code:string}[]} inputs
 * @returns {Promise<void>}
 */
async function writeGraph(directory,inputs){
  for(const file of inputs)await atomicWrite(path.join(directory,file.path),file.code);
}

test('COO three-file four-input Wasm maintains external API and enables seedless public AST reconstruction',{
  timeout:60000
},async()=>{
  const transformed=obfuscateFiles(files,{
    mode:'coo',seed:'multi-esm-bridge-20261116',
    strings:false,properties:false,identifiers:false,
    experimentalWasmI32:{'kernel.mjs':['scramble']}
  });
  const emitted=transformed.files.map(file=>({path:file.path,code:String(file.code)}));
  assert.equal(transformed.files.find(file=>file.path==='kernel.mjs')?.metrics.wasmI32Functions,1);
  assert.equal(emitted.find(file=>file.path==='bridge.mjs')?.code,files[1].code);
  assert.equal(emitted.find(file=>file.path==='entry.mjs')?.code,files[2].code);
  const kernel=emitted.find(file=>file.path==='kernel.mjs');
  assert.ok(kernel);
  const recovered=recoverPublicWasmExpression(kernel.code,['a','b','c','d']);
  assert.equal(recovered.expression,'(((a^b)&(c|d))^((a>>>d)|(c<<b)))');
  const attacker=/** @type {(a:number,b:number,c:number,d:number)=>number} */ (
    /** @type {unknown} */ (new Function('a','b','c','d','return '+recovered.expression+';')));
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-wasm-multi-graph-'));
  const originalDir=path.join(folder,'original');
  const compiledDir=path.join(folder,'compiled');
  const ambient=/** @type {any} */ (globalThis);
  const oldBridge=ambient.externalBridge;
  try{
    await writeGraph(originalDir,files);
    await writeGraph(compiledDir,emitted);
    const native=/** @type {{run:(a:number,b:number,c:number,d:number,label:string)=>string}} */ (
      await import(pathToFileURL(path.join(originalDir,'entry.mjs')).href));
    const compiled=/** @type {typeof native} */ (
      await import(pathToFileURL(path.join(compiledDir,'entry.mjs')).href));
    /** @type {{value:number,label:string}[]} */
    const observed=[];
    let recording=true,calls=0;
    ambient.externalBridge={
      /** @param {number} value @param {string} label @returns {string} */
      deliver(value,label){
        calls++;
        if(recording)observed.push({value,label});
        return label+':'+(value>>>0).toString(16);
      }
    };
    let checksum=0;
    for(let i=0;i<1024;i++){
      const a=(i*1664525)|0,b=(i*1013904223)|0,c=(i*69069)|0,d=(i>>>3)&31;
      const label='call-'+i;
      const expected=native.run(a,b,c,d,label);
      const actual=compiled.run(a,b,c,d,label);
      assert.equal(actual,expected);
      assert.equal(attacker(a,b,c,d),observed[observed.length-1].value);
      assert.deepEqual(observed.slice(-2),[{value:observed[observed.length-1].value,label},
        {value:observed[observed.length-1].value,label}]);
      checksum^=observed[observed.length-1].value;
    }
    assert.equal(calls,2048);
    recording=false;
    /** @param {typeof native.run} fn @returns {number} */
    function workload(fn){
      let sum=0;
      for(let i=0;i<80000;i++)sum^=fn(i|0,(i*1664525)|0,
        (i*1013904223)|0,(i>>>3)&31,'hot').length;
      return sum|0;
    }
    for(let i=0;i<5;i++)assert.equal(workload(native.run),workload(compiled.run));
    /** @type {number[]} */
    const nativeTimes=[];
    /** @type {number[]} */
    const compiledTimes=[];
    for(let i=0;i<11;i++){
      const pair=i%2?[[compiled.run,compiledTimes],[native.run,nativeTimes]]:
        [[native.run,nativeTimes],[compiled.run,compiledTimes]];
      for(const [fn,times] of /** @type {Array<[typeof native.run,number[]]>} */ (pair)){
        const start=performance.now();
        workload(fn);
        times.push(performance.now()-start);
      }
    }
    /** @param {number[]} v @returns {number} */
    const median=v=>[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)];
    console.log(JSON.stringify({
      graphFiles:3,typedComparisons:1024,observedExternalCalls:2048,
      recoveredExpression:recovered.expression,checksum,
      nativeMedianMs:median(nativeTimes),compiledMedianMs:median(compiledTimes),
      hotRatio:median(compiledTimes)/median(nativeTimes)
    }));
  }finally{
    ambient.externalBridge=oldBridge;
    await fs.rm(folder,{recursive:true,force:true});
  }
});
