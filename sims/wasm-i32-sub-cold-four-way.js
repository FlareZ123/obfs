'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {transformSync}=require('esbuild');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {recoverPublicWasmExpression}=require('./wasm-i32-static-recover');
const {pairedBudgetBound}=require('./paired-budget-bound');

/**
 * A single selected pure signed-i32 subtraction function, executed after
 * library-level JS parsing/compilation but including the generated wrapper's
 * synchronous Wasm module initialization on every fresh module instance.
 * This is a Node cold-module proxy, NOT a true browser first-fetch timing
 * or an independently repeated fresh V8 process. It measures one bounded
 * counterexample family, never a universal COO/SNO workload guarantee.
 * @typedef {'native'|'wasm'|'minified'|'reconstructed'} Variant
 */

/** @param {readonly number[]} xs @returns {number} */
function median(xs) {
  const sorted=[...xs].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * @param {(module:{exports:unknown},runtime:typeof globalThis)=>void} initializer
 * @param {number} calls
 * @returns {{ms:number,checksum:number}}
 */
function run(initializer,calls) {
  /** @type {{exports:unknown}} */
  const module={exports:null};
  const before=performance.now();
  initializer(module,globalThis);
  const fn=/** @type {(a:number,b:number)=>number} */ (module.exports);
  let checksum=0;
  for(let i=0;i<calls;i++) {
    const a=Math.imul(i+15,1664525)|0;
    const b=Math.imul(i^0x4c957f2d,1013904223)|0;
    checksum^=fn(a,b);
  }
  return {ms:performance.now()-before,checksum};
}

/**
 * Report initialization-amortization behavior across the same four-way
 * equivalence/fairness controls used in real Chromium, but in Node.
 * SNO server-side initialization can be excluded by user policy; COO
 * client-side initialization cannot. These are not browser observations.
 * @returns {{
 *  node:string,platform:string,wasmBytes:number,
 *  sourceBytes:number,minifiedBytes:number,
 *  inputRows:number,results:Array<{
 *    calls:number,medianMs:Record<Variant,number>,
 *    wasmOverNative:number,wasmOverEqualTrustMinified:number,
 *    wasmOverSourceOnlyClone:number,pairedNative:ReturnType<typeof pairedBudgetBound>,
 *    pairedMinified:ReturnType<typeof pairedBudgetBound>
 *  }>
 * }}
 */
function experiment() {
  const source='function f(a,b){return (((a-b)|0)^(a>>>5))|0;}module.exports=f;';
  const lowered=lowerWasmI32Functions(source,'commonjs',{
    seed:'cold-subtraction-native-minified-source-only-2026-11-28',
    names:['f']
  });
  assert.equal(lowered.functions,1);
  const independent=recoverPublicWasmExpression(lowered.code,['a','b']);
  const clone='function f(a,b){return '+independent.expression+';}module.exports=f;';
  const minified=transformSync(source,{format:'cjs',target:'es2022',
    minify:true,legalComments:'none'}).code;
  /** @type {Record<Variant,(module:{exports:unknown},runtime:typeof globalThis)=>void>} */
  const initializers={
    native:/** @type {(module:{exports:unknown},runtime:typeof globalThis)=>void} */(
      new Function('module','globalThis',source)),
    wasm:/** @type {(module:{exports:unknown},runtime:typeof globalThis)=>void} */(
      new Function('module','globalThis',lowered.code)),
    minified:/** @type {(module:{exports:unknown},runtime:typeof globalThis)=>void} */(
      new Function('module','globalThis',minified)),
    reconstructed:/** @type {(module:{exports:unknown},runtime:typeof globalThis)=>void} */(
      new Function('module','globalThis',clone))
  };
  /** @type {Variant[][]} */
  const orders=[
    ['native','wasm','minified','reconstructed'],
    ['reconstructed','minified','wasm','native'],
    ['wasm','native','reconstructed','minified'],
    ['minified','reconstructed','native','wasm']
  ];
  const callCounts=[1,8,64,512,4096,32768,131072];
  /** @type {Array<{
   *  calls:number,medianMs:Record<Variant,number>,
   *  wasmOverNative:number,wasmOverEqualTrustMinified:number,
   *  wasmOverSourceOnlyClone:number,pairedNative:ReturnType<typeof pairedBudgetBound>,
   *  pairedMinified:ReturnType<typeof pairedBudgetBound>
   * }>} */
  const results=[];
  for(const calls of callCounts) {
    for(let warm=0;warm<8;warm++) {
      const expected=run(initializers.native,calls).checksum;
      for(const variant of /** @type {Variant[]} */(['wasm','minified','reconstructed'])) {
        assert.equal(run(initializers[variant],calls).checksum,expected,
          'Warmup checksum divergence: '+variant+'/'+calls);
      }
    }
    /** @type {Record<Variant,number[]>} */
    const samples={native:[],wasm:[],minified:[],reconstructed:[]};
    for(let trial=0;trial<31;trial++) {
      const expected=run(initializers.native,calls).checksum;
      for(const variant of orders[trial%orders.length]) {
        const seen=run(initializers[variant],calls);
        assert.equal(seen.checksum,expected,
          'Cold parity discrepancy: '+variant+'/'+calls+'/'+trial);
        assert.ok(Number.isFinite(seen.ms)&&seen.ms>0);
        samples[variant].push(seen.ms);
      }
    }
    /** @type {Record<Variant,number>} */
    const medians={
      native:median(samples.native),wasm:median(samples.wasm),
      minified:median(samples.minified),reconstructed:median(samples.reconstructed)
    };
    results.push({
      calls,medianMs:medians,
      wasmOverNative:medians.wasm/medians.native,
      wasmOverEqualTrustMinified:medians.wasm/medians.minified,
      wasmOverSourceOnlyClone:medians.wasm/medians.reconstructed,
      pairedNative:pairedBudgetBound(samples.native,samples.wasm),
      pairedMinified:pairedBudgetBound(samples.minified,samples.wasm)
    });
  }
  return {node:process.version,platform:process.platform,
    wasmBytes:lowered.wasmBytes,sourceBytes:Buffer.byteLength(source),
    minifiedBytes:Buffer.byteLength(minified),inputRows:131072,results};
}
if(require.main===module) {
  try {
    const result=experiment();
    process.stdout.write('WASM_SUB_COLD_FOUR_WAY '+JSON.stringify(result)+'\n');
  }catch(error) {
    console.error(error);
    process.exitCode=1;
  }
}
module.exports={experiment};
