'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');

const BYTECODE=Uint8Array.from([1,7,2,3,3,90,255]);

/** @param {number} x @returns {number} */
function originalNumeric(x) {
  return ((x+7)*3)^90;
}

/**
 * Experimental register-bytecode interpreter for one pure numeric expression.
 * It deliberately avoids eval, external state, and allocating a stack.
 * This is a microbenchmark of interpreter overhead, not a finished general JS
 * compiler or a claim that the bytecode hides the source from offline analysis.
 *
 * @param {number} x
 * @returns {number}
 */
function virtualizedNumeric(x) {
  let accumulator=x;
  let pc=0;
  for(;;){
    const operation=BYTECODE[pc++];
    switch(operation) {
      case 1:accumulator+=BYTECODE[pc++];break;
      case 2:accumulator*=BYTECODE[pc++];break;
      case 3:accumulator^=BYTECODE[pc++];break;
      case 255:return accumulator;
      default:throw new Error('Invalid bytecode');
    }
  }
}

/**
 * Every loop executes the same non-virtualized workload. A periodic protected
 * numeric operation models the fraction of end-to-end compute being hidden.
 *
 * @param {(x:number)=>number} protectedFunction
 * @param {number} iterations
 * @param {number} protectedPeriod
 * @returns {number}
 */
function mixedWorkload(protectedFunction,iterations,protectedPeriod) {
  let accumulator=0;
  for(let i=0;i<iterations;i++) {
    let x=(Math.imul(i,1103515245)+12345)|0;
    if(i%protectedPeriod===0)accumulator^=protectedFunction(x);
    for(let j=0;j<8;j++)x=(Math.imul(x,1664525)+1013904223)|0;
    accumulator=(accumulator+x)|0;
  }
  return accumulator;
}

/** @param {number[]} samples @returns {number} */
function median(samples) {
  const sorted=[...samples].sort((left,right)=>left-right);
  return sorted[Math.floor(sorted.length/2)];
}

/** @param {(n:number,p:number)=>number} fn @param {number} iterations @param {number} period @returns {number} */
function time(fn,iterations,period) {
  const start=performance.now();
  fn(iterations,period);
  return performance.now()-start;
}

/**
 * @param {number} period
 * @param {number} iterations
 * @returns {{period:number,iterations:number,original_ms:number,virtualized_ms:number,ratio:number,within_2_5:boolean,original_samples_ms:number[],virtualized_samples_ms:number[]}}
 */
function runScenario(period,iterations) {
  /** @param {number} n @param {number} p */
  const original=(n,p)=>mixedWorkload(originalNumeric,n,p);
  /** @param {number} n @param {number} p */
  const virtualized=(n,p)=>mixedWorkload(virtualizedNumeric,n,p);
  assert.equal(original(iterations,period),virtualized(iterations,period),
    'VM and original changed behavior');
  for(let i=0;i<8;i++){
    original(40000,period);
    virtualized(40000,period);
  }
  /** @type {number[]} */
  const originalSamples=[];
  /** @type {number[]} */
  const virtualSamples=[];
  for(let trial=0;trial<11;trial++) {
    if(trial%2===0){
      originalSamples.push(time(original,iterations,period));
      virtualSamples.push(time(virtualized,iterations,period));
    }else{
      virtualSamples.push(time(virtualized,iterations,period));
      originalSamples.push(time(original,iterations,period));
    }
  }
  const before=median(originalSamples);
  const after=median(virtualSamples);
  return {period,iterations,original_ms:before,virtualized_ms:after,
    ratio:after/before,within_2_5:after/before<=2.5,
    original_samples_ms:originalSamples,virtualized_samples_ms:virtualSamples};
}

for(let i=-30000;i<30000;i+=17)assert.equal(virtualizedNumeric(i),originalNumeric(i));
const report={
  node:process.version,platform:process.platform,architecture:process.arch,
  experimental:true,
  source_sha256:createHash('sha256').update(originalNumeric.toString()).digest('hex'),
  bytecode_bytes:BYTECODE.length,
  original_expression:originalNumeric.toString(),
  vm_implementation:'register switch dispatch; one opaque bytecode array',
  note:'steady-state hot/cold mixed compute; one-time setup excluded; all times are one-run local samples',
  warmup:8,trials:11,
  measurements:[1,8,64,512].map(period=>runScenario(period,400000))
};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
