'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {recordsFor}=require('../sims/stateful-arx-minifier-control');
const {liftStatefulArxApp}=require('../sims/stateful-arx-static-clone');

/** @typedef {{kind:unknown,payload:unknown}} InputRecord */
/** @typedef {{serial:number,codeUnits:number,words:number[]}} Observation */
/** @typedef {{runScenario:(seed:number,records:InputRecord[],host?:{emit:(event:Observation)=>void})=>string}} App */

/**
 * @param {App} app
 * @param {number} seed
 * @param {InputRecord[]} records
 * @returns {{value:string,hostCalls:string[]}}
 */
function observe(app,seed,records){
  /** @type {string[]} */
  const hostCalls=[];
  const value=app.runScenario(seed,records,{emit(event){hostCalls.push(JSON.stringify(event));}});
  return {value,hostCalls};
}

test('source-only lifted public Wasm stateful app matches native and generated client',async()=>{
  const root=path.join(__dirname,'../examples/stateful-arx-app');
  const native=/** @type {App} */(await import(pathToFileURL(path.join(root,'native/entry.mjs')).href));
  // Import the original candidate before disabling WebAssembly. Its module
  // compiled eagerly; our independent clone never accesses that runtime.
  const candidate=/** @type {App} */(await import(pathToFileURL(path.join(root,'wasm/entry.mjs')).href));
  const initialWebAssembly=globalThis.WebAssembly;
  try{
    globalThis.WebAssembly=/** @type {typeof WebAssembly} */(/** @type {unknown} */(undefined));
    const attacker=liftStatefulArxApp(path.join(root,'wasm/kernel.mjs'));
    assert.equal(attacker.wasmBytes,228);
    assert.equal(attacker.wasmSha256,
      '820810c29949179df5e2cc2d7246b15efe1267fe898390703fc77e3df4f9a96f');
    const records=recordsFor(12288);
    let eventMatches=0;
    for(const seed of [0,-1,0x7fffffff,0x80000000|0]){
      const reference=observe(native,seed,records);
      const generated=observe(candidate,seed,records);
      const copied=observe(attacker,seed,records);
      assert.equal(generated.value,reference.value,'Wasm client output seed='+seed);
      assert.deepEqual(generated.hostCalls,reference.hostCalls,'Wasm callback seed='+seed);
      assert.equal(copied.value,reference.value,'Source-only clone output seed='+seed);
      assert.deepEqual(copied.hostCalls,reference.hostCalls,'Source-only callback seed='+seed);
      assert.equal(copied.hostCalls.length,records.length);
      eventMatches+=copied.hostCalls.length;
    }
    console.log('STATEFUL_ARX_SOURCE_ONLY_FULL_APP_CLONE '+JSON.stringify({
      wasmSha256:attacker.wasmSha256,wasmBytes:attacker.wasmBytes,
      parsedWasmInstructions:attacker.instructions,
      heldOutRecordsPerSeed:records.length,seedCount:4,eventMatches,
      sourceAccess:'published Wasm hex and public entry/state contract only',
      wasmRuntimeAccess:'disabled during clone execution',
      limitation:'known candidate layout, unblinded, no balanced attacker-time control'
    }));
  }finally{globalThis.WebAssembly=initialWebAssembly;}
});
