'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {lowerPolyvariantAffine}=require('../src');

/** @param {number[]} values @returns {number} */
function median(values) {
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/**
 * Alternate original and transformed cold Script compilation to reduce
 * temporal/JIT/order effects. Fresh comment suffixes include a per-variant
 * tag, so an earlier original-source round cannot be byte-for-byte reused in
 * the next variant. Code caching remains a benchmark limitation.
 *
 * @param {string} original
 * @param {string} transformed
 * @param {number} variants
 * @returns {{originalMs:number,transformedMs:number,originalTrials:number[],transformedTrials:number[]}}
 */
function compareCold(original,transformed,variants) {
  for(let i=0;i<100;i++) {
    assert.ok(new vm.Script(original+'\n//warm-native-'+variants+'-'+i));
    assert.ok(new vm.Script(transformed+'\n//warm-protected-'+variants+'-'+i));
  }
  const originalTrials=[],transformedTrials=[];
  for(let batch=0;batch<11;batch++) {
    for(const which of batch%2===0?['original','transformed']:['transformed','original']) {
      const source=which==='original'?original:transformed;
      const start=performance.now();
      for(let i=0;i<400;i++) {
        const suffix='bench-'+variants+'-'+which+'-'+batch+'-'+i;
        assert.ok(new vm.Script(source+'\n//'+suffix,{
          filename:suffix+'.cjs'
        }));
      }
      const elapsed=performance.now()-start;
      (which==='original'?originalTrials:transformedTrials).push(elapsed);
    }
  }
  return {originalMs:median(originalTrials),transformedMs:median(transformedTrials),
    originalTrials,transformedTrials};
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
    const pair=compareCold(original,result.code,variants);
    results.push({
      variants,originalBytes:Buffer.byteLength(original,'utf8'),
      generatedBytes:Buffer.byteLength(result.code,'utf8'),
      nativeMedianMs:pair.originalMs,
      transformedMedianMs:pair.transformedMs,
      coldCompileRatio:pair.transformedMs/pair.originalMs
    });
  }
  process.stdout.write(JSON.stringify({
    platform:process.platform,node:process.version,
    method:'11-trial medians of alternating original/protected batches, 400 unique vm.Script compilations per batch; parse/compiler only',
    results
  },null,2)+'\n');
}
main();
