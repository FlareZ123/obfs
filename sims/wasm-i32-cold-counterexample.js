'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {lowerWasmI32Functions}=require('../src/wasm-i32');

/** @typedef {{calls:number,nativeMedianMs:number,wasmMedianMs:number,ratio:number,within2_5x:boolean}} Observation */

/** @param {number[]} samples @returns {number} */
function median(samples) {
  const ordered=[...samples].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/**
 * Measure one initialized module followed by N calls. JS parsing is
 * deliberately outside the measurement, isolating the runtime startup
 * penalty and hot-path work under the same compiled JavaScript wrappers.
 * @param {(module:{exports:unknown},runtime:typeof globalThis)=>void} initializer
 * @param {number} count
 * @returns {{ms:number,checksum:number}}
 */
function run(initializer,count) {
  /** @type {{exports:unknown}} */
  const module={exports:null};
  const start=performance.now();
  initializer(module,globalThis);
  const fn=/** @type {(x:number)=>number} */(module.exports);
  let checksum=0;
  for(let index=0;index<count;index++)checksum^=fn((index*1664525)|0);
  return {ms:performance.now()-start,checksum};
}

/**
 * A selected COO-like application may execute only a few calls, making the
 * synchronous Wasm compilation much more expensive than native JS work.
 * This is one reproducible workload, not a universal runtime prediction.
 * @returns {{node:string,platform:string,cases:Observation[],wasmBytes:number}}
 */
function experiment() {
  const source='function f(x){return (((x^137)&(x>>>3))|(x<<7));}module.exports=f;';
  const lowered=lowerWasmI32Functions(source,'commonjs',{
    seed:'wasm-i32-cold-curve-2026-11-15',names:['f']
  });
  assert.equal(lowered.functions,1);
  const native=/** @type {(module:{exports:unknown},runtime:typeof globalThis)=>void} */(
    new Function('module','globalThis',source));
  const protectedInit=/** @type {(module:{exports:unknown},runtime:typeof globalThis)=>void} */(
    new Function('module','globalThis',lowered.code));
  /** @type {Observation[]} */
  const observations=[];
  for(const calls of [1,4,16,64,256,1024,8192,65536,150000]) {
    for(let trial=0;trial<20;trial++) {
      assert.equal(run(native,calls).checksum,run(protectedInit,calls).checksum);
    }
    /** @type {number[]} */
    const original=[];
    /** @type {number[]} */
    const obfuscated=[];
    for(let trial=0;trial<101;trial++) {
      /** @type {[typeof native,number[]][]} */
      const order=trial%2===0?[[native,original],[protectedInit,obfuscated]]:
        [[protectedInit,obfuscated],[native,original]];
      for(const [fn,samples] of order) {
        const measured=run(/** @type {typeof native} */(fn),calls);
        samples.push(measured.ms);
      }
    }
    const nativeMedianMs=median(original),wasmMedianMs=median(obfuscated);
    observations.push({calls,nativeMedianMs,wasmMedianMs,
      ratio:wasmMedianMs/nativeMedianMs,within2_5x:wasmMedianMs<=2.5*nativeMedianMs});
  }
  return {node:process.version,platform:process.platform,cases:observations,
    wasmBytes:lowered.wasmBytes};
}

if(require.main===module)process.stdout.write(JSON.stringify(experiment(),null,2)+'\n');
module.exports={experiment};
