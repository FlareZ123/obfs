'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {lowerF64Expression}=require('./wasm-numeric-lower');

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Minimal original numeric work, with a fresh JS function compile per trial.
 * This surrogate does not account for parser/JIT behavior of real ESM graphs.
 * @param {number} n
 * @returns {number}
 */
function nativeCold(n) {
  // Deliberately parse a fresh function to avoid comparing WebAssembly module
  // creation to an already-compiled in-memory function closure.
  const native=new Function('x','y','return (((x*1.25)+y)*0.75)-(x/7);');
  let result=0;
  for(let i=0;i<n;i++) result+=native((i%10007)/7,(i%311)/19);
  return result;
}

/**
 * Compile and instantiate the shipped public Wasm bytes from scratch. Offline
 * source->Wasm compilation is excluded, as it occurs before distribution.
 * @param {Uint8Array} bytes
 * @param {number} n
 * @returns {number}
 */
function wasmCold(bytes,n) {
  const wasm=/** @type {(x:number,y:number)=>number} */ (
    new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports.score
  );
  let result=0;
  for(let i=0;i<n;i++) result+=wasm((i%10007)/7,(i%311)/19);
  return result;
}

/**
 * @param {Uint8Array} bytes
 * @param {number} calls
 * @returns {{calls:number,medianNativeMs:number,medianWasmMs:number,ratio:number,nativeMs:number[],wasmMs:number[]}}
 */
function coldPair(bytes,calls) {
  for(let warm=0;warm<3;warm++) {
    assert.equal(wasmCold(bytes,calls),nativeCold(calls));
  }
  /** @type {number[]} */
  const native=[];
  /** @type {number[]} */
  const wasm=[];
  for(let trial=0;trial<20;trial++) {
    for(const [kind,samples] of trial%2===0?[
      ['native',native],['wasm',wasm]
    ]:[
      ['wasm',wasm],['native',native]
    ]) {
      const start=performance.now();
      const result=kind==='native'?nativeCold(calls):wasmCold(bytes,calls);
      samples.push(performance.now()-start);
      assert.ok(Number.isFinite(result));
    }
  }
  const medianNativeMs=median(native);
  const medianWasmMs=median(wasm);
  return {calls,medianNativeMs,medianWasmMs,
    ratio:medianWasmMs/medianNativeMs,nativeMs:native,wasmMs:wasm};
}

/** @returns {Promise<object>} */
async function experiment() {
  const output=await lowerF64Expression(
    'function score(x,y){return (((x*1.25)+y)*0.75)-(x/7);}'
  );
  const workloads=[1,10,1000,100000];
  return {
    node:process.version,platform:process.platform,
    wasmBytes:output.bytes.length,
    mode:'Illustrative cold JS new Function vs fresh Wasm module+instance. No network or script packaging; excludes offline code generation.',
    performance:workloads.map(calls=>coldPair(output.bytes,calls))
  };
}

if(require.main===module) {
  experiment().then(value=>console.log(JSON.stringify(value,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={experiment};
