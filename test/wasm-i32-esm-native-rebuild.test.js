'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src/core');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {atomicWrite}=require('../src/atomic');
const {reconstructPublicWasmEsm}=require('../sims/wasm-i32-esm-native-rebuild');

// Public labels are string values; the entry performs only i32 operations
// on transformed exports, avoiding cross-file source coercion.
/** @type {Array<{path:string,sourceType:'module',code:string}>} */
const files=[
  {path:'kernel.mjs',sourceType:'module',
    code:'export function scramble(a,b,c,d){return (((a^b)&(c|d))^((a>>>d)|(c<<b)));}'+
      'export function mask(x){return x?((x^137)&255):((~x)|7);}'},
  {path:'bridge.mjs',sourceType:'module',
    code:'export function forward(value,label){return globalThis.externalBridge.deliver(value,label);}'},
  {path:'entry.mjs',sourceType:'module',
    code:'import {scramble,mask} from "./kernel.mjs";import {forward} from "./bridge.mjs";'+
      'export function run(a,b,c,d,label){return forward((scramble(a,b,c,d)^mask(a))|0,label);}'}
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

test('unconstrained label string coercion declines cross-file Wasm rewriting',()=>{
  const observed=files.map(file=>file.path==='entry.mjs'?{
    ...file,code:file.code.replace(
      'return forward((scramble(a,b,c,d)^mask(a))|0,label);',
      'return forward(scramble(a,b,c,d),label+":"+mask(a));'
    )
  }:file);
  assert.notEqual(observed[2].code,files[2].code);
  const options={
    mode:/** @type {const} */('coo'),seed:'label-source-observation',
    closedWorld:true,properties:false,identifiers:false,strings:false,
    experimentalWasmI32:{'kernel.mjs':['scramble','mask']}
  };
  assert.throws(()=>obfuscateFiles(observed,options),
    /Wasm i32 requires a module\\/CommonJS without cross-file source observation/u);
  const safe=obfuscateFiles(files,options);
  assert.equal(safe.files.find(file=>file.path==='kernel.mjs')?.metrics.wasmI32Functions,2);
});

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
        properties:false,identifiers:seed%2===1,strings:false,
        experimentalWasmI32:{'kernel.mjs':['scramble','mask']}
      });
      const emitted=compiled.files.map(file=>({path:file.path,code:String(file.code)}));
      const kernel=emitted.find(file=>file.path==='kernel.mjs');
      assert.ok(kernel);
      assert.equal(compiled.files.find(file=>file.path==='kernel.mjs')?.metrics.wasmI32Functions,2);
      const attacker=reconstructPublicWasmEsm(kernel.code);
      assert.deepEqual(attacker.functions.map(fn=>fn.name),['scramble','mask']);
      if(seed%2===0){
        assert.deepEqual(attacker.functions.map(fn=>fn.expression),
          ['(((a^b)&(c|d))^((a>>>d)|(c<<b)))','(x?((x^137)&255):((~x)|7))']);
      }else{
        assert.deepEqual(attacker.functions.map(fn=>fn.parameters.length),[4,1]);
      }
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
        const boundary=[-2147483648,-1,0,1,31,32,2147483647,0x12345678];
        const a=i<boundary.length?boundary[i]:randomI32();
        const b=randomI32(),c=randomI32(),d=(i>>>3)&31;
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

test('public ESM native replacement retains early cyclic import execution',{
  timeout:60000
},async()=>{
  const kernel='import "./peer.mjs";\n'+
    'export function f(a,b,c,d){return a?((b^c)&255):((~d)^c);}\n';
  const peer='import {f} from "./kernel.mjs";\n'+
    'export const early=['+
      '[0,-2147483648,0,1],'+
      '[1,-2147483648,12345,2147483647],'+
      '[-1,-1,0,0],'+
      '[0,123456,54321,-1]'+
    '].map(args=>f(...args));\n';
  /** @param {string} delivered @returns {Promise<{early:number[],later:number[]}>} */
  async function cycle(delivered){
    const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-wasm-rebuild-cycle-'));
    try{
      await atomicWrite(path.join(folder,'kernel.mjs'),delivered);
      await atomicWrite(path.join(folder,'peer.mjs'),peer);
      const owner=await import(pathToFileURL(path.join(folder,'kernel.mjs')).href);
      const companion=await import(pathToFileURL(path.join(folder,'peer.mjs')).href);
      return {early:companion.early,later:[
        owner.f(0,-2147483648,3,2147483647),
        owner.f(7,17,31,47),
        owner.f(-7,17,-31,-47),
        owner.f(0,-1,2,-3)
      ]};
    }finally{
      await fs.rm(folder,{recursive:true,force:true});
    }
  }
  const original=await cycle(kernel);
  for(let index=0;index<4;index++){
    const compiled=lowerWasmI32Functions(kernel,'module',{
      seed:'native-cycle-'+index,names:['f']
    });
    assert.equal(compiled.functions,1);
    const cloned=reconstructPublicWasmEsm(compiled.code);
    assert.match(cloned.code,/^import "\.\/peer\.mjs";/u);
    assert.doesNotMatch(cloned.code,/WebAssembly|Uint8Array/u);
    assert.deepEqual(await cycle(compiled.code),original);
    assert.deepEqual(await cycle(cloned.code),original);
  }
});

test('ESM native rebuild refuses a stateful generated-helper lookalike',()=>{
  const lowered=lowerWasmI32Functions(
    'export function f(x){return (x^31);}','module',{
      seed:'unproved-helper-side-effect',names:['f']
    });
  assert.equal(lowered.functions,1);
  const polluted=lowered.code.replace(
    /(function _wi_[0-9a-f]+\([^)]*\)\{)/u,
    '$1globalThis.__unproved=1;');
  assert.notEqual(polluted,lowered.code);
  assert.throws(()=>reconstructPublicWasmEsm(polluted),
    /Unrecognized compiler helper/u);
});

test('ESM native rebuild rejects extra module effects and unproved exports',()=>{
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
