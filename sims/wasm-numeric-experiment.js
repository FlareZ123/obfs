'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {lowerF64Expression,cloneWasmExport}=require('./wasm-numeric-lower');

/** @typedef {{medianMs:number,samples:number[]}} Timing */

/** @param {number[]} samples @returns {number} */
function median(samples) {
  const sorted=[...samples].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Workload invokes its numeric kernel at every iteration. This prevents a
 * once-per-512 mixed workload from hiding a protected hot-path slowdown.
 * @param {(x:number,y:number)=>number} kernel
 * @param {number} count
 * @returns {number}
 */
function work(kernel,count) {
  let total=0;
  for(let i=0;i<count;i++) {
    total+=kernel((i%10007)/7,(i%311)/19);
  }
  return total;
}

/**
 * Alternate measurement order across two groups to reduce systematic JIT
 * warmup and run-order biases. The samples are still illustrative, not a
 * hardware-independent performance guarantee.
 * @param {(x:number,y:number)=>number} native
 * @param {(x:number,y:number)=>number} wasm
 * @returns {{native:Timing,wasm:Timing,ratio:number}}
 */
function benchmark(native,wasm) {
  const n=220000;
  for(let i=0;i<8;i++) {
    assert.equal(work(wasm,n),work(native,n));
    work(native,n);
  }
  /** @type {number[]} */
  const first=[];
  /** @type {number[]} */
  const second=[];
  for(let i=0;i<28;i++) {
    const order=i%2===0?[[native,first],[wasm,second]]:[[wasm,second],[native,first]];
    for(const [fn,results] of order) {
      const start=performance.now();
      const result=work(/** @type {(x:number,y:number)=>number} */ (fn),n);
      results.push(performance.now()-start);
      assert.ok(Number.isFinite(result));
    }
  }
  return {native:{medianMs:median(first),samples:first},
    wasm:{medianMs:median(second),samples:second},
    ratio:median(second)/median(first)};
}

/**
 * Test whether a restricted numeric JS->Wasm candidate is semantically
 * precise and fast enough for its stated hot Number-only contract, then
 * demonstrate standalone binary cloning without original JS source.
 * @returns {Promise<object>}
 */
async function experiment() {
  const source='function score(x,y){return (((x*1.25)+y)*0.75)-(x/7);}' ;
  /** @param {number} x @param {number} y @returns {number} */
  function native(x,y) {return (((x*1.25)+y)*0.75)-(x/7);}
  const lowerStart=performance.now();
  const emitted=await lowerF64Expression(source);
  const compileStart=performance.now();
  const wasm=/** @type {(x:number,y:number)=>number} */
    (cloneWasmExport(emitted.bytes,emitted.exportName));
  const wasmInitMs=performance.now()-compileStart;
  const loweringMs=compileStart-lowerStart;
  assert.ok(WebAssembly.validate(emitted.bytes));
  const attacker=/** @type {(x:number,y:number)=>number} */
    (cloneWasmExport(Buffer.from(emitted.bytes),emitted.exportName));

  // Standard third-party Wasm disassembly. It accepts *only binary bytes*.
  const binaryen=(await import('binaryen')).default;
  const parsed=binaryen.readBinary(emitted.bytes);
  let disassembly;
  try { disassembly=parsed.emitText(); }
  finally {parsed.dispose();}
  for(const opcode of ['f64.mul','f64.add','f64.sub','f64.div']) {
    assert.ok(disassembly.includes(opcode),'Public Wasm disassembly misses '+opcode);
  }

  const special=[0,-0,NaN,Infinity,-Infinity,Number.MAX_VALUE,
    -Number.MAX_VALUE,Number.MIN_VALUE,-Number.MIN_VALUE,
    Number.EPSILON,-Number.EPSILON];
  let compared=0;
  for(const x of special)for(const y of special) {
    assert.ok(Object.is(wasm(x,y),native(x,y)),'Wasm differs from native at '+x+','+y);
    assert.ok(Object.is(attacker(x,y),native(x,y)));
    compared++;
  }
  for(let i=0;i<5000;i++) {
    const x=((i*37.617)%12343)-6000;
    const y=((i*13.7)%1234)-600;
    assert.ok(Object.is(wasm(x,y),native(x,y)),'F64 numeric mismatch at '+i);
    assert.ok(Object.is(attacker(x,y),native(x,y)));
    compared++;
  }

  // Demonstrate mandatory numeric input type proof. JS '+' concatenates for
  // strings whereas Wasm f64.add coerces strings to numbers.
  const plus=await lowerF64Expression('function plus(x,y){return x+y;}');
  const wasmPlus=cloneWasmExport(plus.bytes,plus.exportName);
  assert.equal('4'+2,'42');
  assert.equal(wasmPlus('4',2),6);
  for(const rejected of [
    'function rejected(x){return String(x);}',
    'function rejected(x){return x.value;}',
    'function rejected(x){return x**2;}',
    'function rejected(x){return x+globalThis.value;}',
    'function rejected(x){const a=x;return a;}'
  ]) {
    await assert.rejects(lowerF64Expression(rejected),/Wasm candidate|Unsupported JS|Unbound identifier/);
  }

  const timings=benchmark(native,wasm);
  return {
    node:process.version,platform:process.platform,
    sourceSHA256:createHash('sha256').update(source).digest('hex'),
    wasmSHA256:createHash('sha256').update(emitted.bytes).digest('hex'),
    wasmBytes:emitted.bytes.length,
    observedNativeCases:compared,
    staticAttackerCloneExact:compared,
    disassemblyContainsF64Arithmetic:true,
    stringPlusCounterexample:{native:'42',wasm:6},
    wasmInitMs,loweringMs,
    hotPathNativeMedianMs:timings.native.medianMs,
    hotPathWasmMedianMs:timings.wasm.medianMs,
    hotPathRatio:timings.ratio,
    hotPathWithin2_5x:timings.ratio<=2.5,
    nativeMs:timings.native.samples,wasmMs:timings.wasm.samples,
    scope:'No source observations, number-only arguments, direct arithmetic expression; startup excluded from hot ratio'
  };
}

if(require.main===module) {
  experiment().then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={experiment};
