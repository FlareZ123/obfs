'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {lowerPolyvariantAffine}=require('../src');

/** @param {number[]} entries @returns {number} */
function median(entries) {
  const values=[...entries].sort((a,b)=>a-b);
  return values[Math.floor(values.length/2)];
}

/**
 * Measure V8 fresh source compilation through vm.Script with a unique source
 * comment on each compilation to discourage reuse of a prior code cache.
 * This isolates parse/compiler setup, rather than a full application runtime.
 * @param {string} source
 * @returns {{medianMs:number,trialsMs:number[]}}
 */
function compileBatch(source) {
  for(let i=0;i<100;i++) {
    assert.ok(new vm.Script(source+'\n//warm-'+i,{filename:'warm-'+i+'.cjs'}));
  }
  const trials=[];
  for(let batch=0;batch<9;batch++) {
    const start=performance.now();
    for(let i=0;i<400;i++) {
      const suffix=batch*400+i;
      assert.ok(new vm.Script(source+'\n//unique-'+suffix,{
        filename:'fresh-'+suffix+'.cjs'
      }));
    }
    trials.push(performance.now()-start);
  }
  return {medianMs:median(trials),trialsMs:trials};
}

/** @returns {void} */
function main() {
  const original=fs.readFileSync(path.join(__dirname,
    '../examples/polyvariant-affine/original.cjs'),'utf8').replace(/\r\n/g,'\n');
  /** @type {{variants:number,originalBytes:number,generatedBytes:number,nativeMedianMs:number,transformedMedianMs:number,coldCompileRatio:number}[]} */
  const results=[];
  for(const variants of [2,4,8]) {
    const result=lowerPolyvariantAffine(original,'commonjs',{
      seed:'cold-polyvariant-2026-11-16',
      names:['guardedTotal'],variants:/** @type {2|4|8} */ (variants)
    });
    assert.equal(result.functions,1);
    const originalTrial=compileBatch(original);
    const transformedTrial=compileBatch(result.code);
    results.push({
      variants,originalBytes:Buffer.byteLength(original,'utf8'),
      generatedBytes:Buffer.byteLength(result.code,'utf8'),
      nativeMedianMs:originalTrial.medianMs,
      transformedMedianMs:transformedTrial.medianMs,
      coldCompileRatio:transformedTrial.medianMs/originalTrial.medianMs
    });
  }
  process.stdout.write(JSON.stringify({
    platform:process.platform,node:process.version,
    method:'9-trial medians of 400 unique vm.Script fresh compilations; parse/compiler only',
    results
  },null,2)+'\n');
}
main();
