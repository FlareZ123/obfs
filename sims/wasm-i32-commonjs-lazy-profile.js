'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');

/** @param {number[]} samples @returns {number} */
function median(samples) {
  const sorted=[...samples].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @param {number} count @returns {string} */
function makeSource(count) {
  const declarations=Array.from({length:count},(_,i)=>
    'function f'+i+'(x){return ((x^'+(17+i)+')&((x<<2)|63));}');
  return declarations.join('\n')+'\nmodule.exports=f0;';
}

/**
 * Compile, evaluate, and invoke a fresh CommonJS session.
 * @param {string} source
 * @returns {{ms:number,fn:(x:number)=>number,answer:number}}
 */
function session(source) {
  const module={exports:/** @type {unknown} */(null)};
  const start=performance.now();
  vm.runInNewContext(source,{module,globalThis},{timeout:5000});
  const fn=/** @type {(x:number)=>number} */(module.exports);
  const answer=fn(0x4f);
  return {ms:performance.now()-start,fn,answer};
}

/** @param {(x:number)=>number} fn @param {number} count @returns {number} */
function warmWork(fn,count) {
  let sum=0;
  for(let i=0;i<count;i++)sum^=fn((i*1664525)|0);
  return sum|0;
}

for(const count of [1,8,24]) {
  const native=makeSource(count);
  const names=Array.from({length:count},(_,i)=>'f'+i);
  const baseOptions={seed:'commonjs-lazy-cost-'+count,names};
  const eager=lowerWasmI32Functions(native,'commonjs',baseOptions);
  const lazy=lowerWasmI32Functions(native,'commonjs',{
    ...baseOptions,deferCommonJsInitialization:true
  });
  assert.equal(eager.functions,count);
  assert.equal(lazy.functions,count);
  assert.equal(eager.wasmBytes,lazy.wasmBytes);
  const variants={
    native,
    lazy:lazy.code,
    eager:eager.code
  };
  const results={
    native:/** @type {number[]} */([]),
    lazy:/** @type {number[]} */([]),
    eager:/** @type {number[]} */([])
  };
  const warm={
    native:/** @type {number[]} */([]),
    lazy:/** @type {number[]} */([]),
    eager:/** @type {number[]} */([])
  };
  const expectedWarm=warmWork(session(native).fn,100000);
  for(let trial=0;trial<11;trial++) {
    const namesOrder=/** @type {('native'|'lazy'|'eager')[]} */(
      ['native','lazy','eager']);
    const ordered=namesOrder.slice(trial%3).concat(namesOrder.slice(0,trial%3));
    for(const variant of ordered) {
      const measured=session(variants[variant]);
      assert.equal(measured.answer,((0x4f^17)&((0x4f<<2)|63)));
      results[variant].push(measured.ms);
      const start=performance.now();
      const answer=warmWork(measured.fn,100000);
      const elapsed=performance.now()-start;
      assert.equal(answer,expectedWarm);
      warm[variant].push(elapsed);
    }
  }
  console.log(JSON.stringify({
    compiler:'wasm-i32-commonjs-deferred',
    count,executedFunctions:1,sourceBytes:Buffer.byteLength(native),
    lazyBytes:Buffer.byteLength(lazy.code),eagerBytes:Buffer.byteLength(variants.eager),
    coldMedianMs:{
      native:median(results.native),
      eager:median(results.eager),
      lazy:median(results.lazy)
    },
    coldRatios:{
      eagerOverNative:median(results.eager)/median(results.native),
      lazyOverNative:median(results.lazy)/median(results.native),
      eagerOverLazy:median(results.eager)/median(results.lazy)
    },
    warmMedianMs:{
      native:median(warm.native),
      eager:median(warm.eager),
      lazy:median(warm.lazy)
    },
    warmRatios:{
      eagerOverNative:median(warm.eager)/median(warm.native),
      lazyOverNative:median(warm.lazy)/median(warm.native)
    },
    rawColdMs:results,
    rawWarmWorkMs:warm,
    note:'VM session includes JS parsing, module evaluation and one invocation; warm work is timed separately. The first lazy compile is execution cost and cannot be discounted from SNO runtime.'
  }));
}
