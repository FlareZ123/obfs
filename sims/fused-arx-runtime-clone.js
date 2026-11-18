'use strict';

const assert=require('node:assert/strict');
const {cloneObservedWasm}=require('./wasm-captured-clone');

/** @typedef {import('./wasm-runtime-capture').WasmCapture} WasmCapture */

/**
 * Replay the fixed public four-word ARX Wasm pilot independently of its
 * compiler and original JS implementation. The ABI is visible in distributed
 * wrapper code: i32 a,b,c,d, input pointer, code-unit length, then four i32
 * result words in the exported memory at offsets 0..15. Nothing is decrypted.
 *
 * @param {WasmCapture} capture
 * @param {string} sha256
 * @returns {{bytes:Uint8Array,memory:WebAssembly.Memory,
 *   run:(state:readonly number[],units:Uint16Array)=>number[]}}
 */
function replayCapturedFusedArx(capture,sha256){
  const cloned=cloneObservedWasm(capture,sha256);
  assert.deepEqual(cloned.imports,[],'Expected import-free public ARX module');
  assert.deepEqual(cloned.exports,[
    {name:'mix',kind:'function'},{name:'memory',kind:'memory'}
  ],'Unexpected public ARX ABI');
  const fn=/** @type {(a:number,b:number,c:number,d:number,pointer:number,length:number)=>void} */(
    /** @type {unknown} */(cloned.instance.exports.mix));
  const memory=/** @type {WebAssembly.Memory} */(
    /** @type {unknown} */(cloned.instance.exports.memory));
  let view=new DataView(memory.buffer);
  /** @param {readonly number[]} state @param {Uint16Array} units @returns {number[]} */
  function run(state,units){
    assert.equal(state.length,4,'Expected exactly four Int32 state words');
    const required=16+2*units.length;
    if(required>memory.buffer.byteLength){
      memory.grow(Math.ceil((required-memory.buffer.byteLength)/65536));
      view=new DataView(memory.buffer);
    }
    for(let i=0;i<units.length;i++)view.setUint16(16+i*2,units[i],true);
    fn(state[0],state[1],state[2],state[3],16,units.length);
    return [view.getInt32(0,true),view.getInt32(4,true),
      view.getInt32(8,true),view.getInt32(12,true)];
  }
  return {bytes:cloned.bytes,memory,run};
}

module.exports={replayCapturedFusedArx};
