'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');
const {reconstructPublicWasmEsm}=require('../sims/wasm-i32-esm-native-rebuild');

/** @type {Array<{path:string,sourceType:'module',code:string}>} */
const files=[
  {path:'kernel.mjs',sourceType:'module',
    code:'export function scramble(a,b,c,d){return (((a^b)&(c|d))^((a>>>d)|(c<<b)));}'+
      'export function mask(x){return ((x^137)&255);}'},
  {path:'bridge.mjs',sourceType:'module',
    code:'export function forward(value,label){return globalThis.externalBridge.deliver(value,label);}'},
  {path:'entry.mjs',sourceType:'module',
    code:'import {scramble,mask} from "./kernel.mjs";import {forward} from "./bridge.mjs";'+
      'export function run(a,b,c,d,label){return forward(scramble(a,b,c,d),label+":"+mask(a));}'}
];

/** @param {string} folder @param {Array<{path:string,code:string}>} graph */
async function writeGraph(folder,graph){
  for(const file of graph)await atomicWrite(path.join(folder,file.path),file.code);
}

/** @param {string} folder @returns {Promise<{run:(a:number,b:number,c:number,d:number,label:string)=>string}>} */
async function loadGraph(folder){
  return /** @type {{run:(a:number,b:number,c:number,d:number,label:string)=>string}} */ (
    await import(pathToFileURL(path.join(folder,'entry.mjs')).href));
}

let state=0x9bf34621;
/** @returns {number} */
function randomI32(){state^=state<<13;state^=state>>>17;state^=state<<5;return state|0;}

test('offline ESM native rebuild replaces both published Wasm functions across a three-file app',{
  timeout:60000
},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-wasm-native-graph-'));
  const oldBridge=/** @type {any} */(globalThis).externalBridge;
  try{
    const originalFolder=path.join(root,'native');
    await writeGraph(originalFolder,files);
    const native=await loadGraph(originalFolder);
    let comparisons=0;
    for(let seed=0;seed<4;seed++){
      const compiled=obfuscateFiles(files,{
        mode:'coo',seed:'wasm-graph-static-rebuild-'+seed,closedWorld:true,
        properties:false,identifiers:false,strings:false,
        experimentalWasmI32:{'kernel.mjs':['scramble','mask']}
      });
      const emitted=compiled.files.map(file=>({path:file.path,code:String(file.code)}));
      const kernel=emitted.find(file=>file.path==='kernel.mjs');
      assert.ok(kernel);
      assert.equal(compiled.files.find(file=>file.path==='kernel.mjs')?.metrics.wasmI32Functions,2);
      const attacker=reconstructPublicWasmEsm(kernel.code);
      assert.deepEqual(attacker.functions.map(fn=>fn.name),['scramble','mask']);
      assert.deepEqual(attacker.functions.map(fn=>fn.expression),
        ['(((a^b)&(c|d))^((a>>>d)|(c<<b)))','((x^137)&255)']);
      assert.ok(attacker.replacementBytes<attacker.sourceBytes);
      assert.doesNotMatch(attacker.code,/WebAssembly|Uint8Array/u);
      const rebuilt=emitted.map(file=>file.path==='kernel.mjs'?
        {path:file.path,code:attacker.code}:file);
      const compiledFolder=path.join(root,'compiled-'+seed);
      const attackerFolder=path.join(root,'attacker-'+seed);
      await writeGraph(compiledFolder,emitted);
      await writeGraph(attackerFolder,rebuilt);
      const protectedApp=await loadGraph(compiledFolder);
      const reconstructedApp=await loadGraph(attackerFolder);
      /** @type {Array<{value:number,label:string}>} */
      const callbackTrace=[];
      (/** @type {any} */(globalThis)).externalBridge={
        /** @param {number} value @param {string} label @returns {string} */
        deliver(value,label){
          callbackTrace.push({value,label});
          return label+':'+(value>>>0).toString(16);
        }
      };
      for(let i=0;i<1024;i++){
        const a=randomI32(),b=randomI32(),c=randomI32(),d=(i>>>3)&31;
        const label='sample-'+i;
        const original=native.run(a,b,c,d,label);
        const protectedResult=protectedApp.run(a,b,c,d,label);
        const reconstructed=reconstructedApp.run(a,b,c,d,label);
        assert.equal(protectedResult,original);
        assert.equal(reconstructed,original);
        const trace=callbackTrace.splice(0);
        assert.equal(trace.length,3);
        assert.deepEqual(trace[1],trace[0]);
        assert.deepEqual(trace[2],trace[0]);
        comparisons++;
      }
    }
    assert.equal(comparisons,4096);
  }finally{
    (/** @type {any} */(globalThis)).externalBridge=oldBridge;
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('ESM native rebuild rejects imports, extra module effects and unproved exports',()=>{
  for(const code of [
    'import "./side-effect.mjs";export function f(x){return x;}',
    'console.log("side-effect");export function f(x){return x;}',
    'export const sensitive=3;',
    'export function f(x){return x;}',
    'function helper(x){return x;}export function f(x){return helper(x);}'
  ]){
    assert.throws(()=>reconstructPublicWasmEsm(code),TypeError);
  }
});
