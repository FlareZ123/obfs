'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {flattenStatementFlow}=require('../src/statement-flow');

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}
const original='function f(x){var a=x|0;if(a>100){a+=23;}else if(a>10){a^=9;}else{a-=4;}return a;}';
const lowered=flattenStatementFlow(original,'commonjs',{
  seed:'statement-flow-pure-hot-20261116',names:['f']
});
assert.equal(lowered.functions,1);
const native=/** @type {(value:number)=>number} */ (vm.runInNewContext(original+';f;'));
const transformed=/** @type {(value:number)=>number} */ (vm.runInNewContext(lowered.code+';f;'));
const iterations=12000000;

/**
 * Warm caller and callee together; the trial includes one native function
 * invocation per input. V8 is free to optimize and inline each implementation
 * as it would inside a hot call site.
 * @param {(value:number)=>number} fn
 * @param {number} count
 * @returns {{checksum:number,elapsedMs:number}}
 */
function run(fn,count){
  let checksum=0;
  const start=performance.now();
  for(let index=0;index<count;index++){
    checksum=(checksum+fn((index&1023)-512))|0;
  }
  return {checksum,elapsedMs:performance.now()-start};
}
/** @type {number[]} */
const baseline=[];
/** @type {number[]} */
const compiled=[];
for(let trial=0;trial<6;trial++){
  for(const kind of trial%2?['compiled','native']:['native','compiled']){
    const fn=kind==='native'?native:transformed;
    run(fn,250000);
    const measured=run(fn,iterations);
    (kind==='native'?baseline:compiled).push(measured.elapsedMs);
    assert.equal(run(native,8192).checksum,run(transformed,8192).checksum);
  }
}
const base=median(baseline);
const obfuscated=median(compiled);
process.stdout.write(JSON.stringify({
  profile:'tiny hot arithmetic function without callback work',
  node:process.version,platform:process.platform,
  iterations,baselineMedianMs:base,compiledMedianMs:obfuscated,
  ratio:obfuscated/base,passes2_5x:obfuscated<=2.5*base,
  sourceBytes:Buffer.byteLength(original),compiledBytes:Buffer.byteLength(lowered.code),
  samples:{baseline,compiled}
},null,2)+'\n');
