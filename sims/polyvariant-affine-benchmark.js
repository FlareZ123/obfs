'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {lowerPolyvariantAffine}=require('../src');

/** @param {string} code @returns {(x:number)=>number} */
function load(code) {
  /** @type {{exports:(x:number)=>number}} */
  const module={exports:x=>x};
  Function('module','exports',code)(module,module.exports);
  return module.exports;
}

/**
 * Evaluate a deterministic mixture of dense calls and sparse, user-facing
 * work. The return value prevents dead-code elimination of the function.
 * @param {(x:number)=>number} fn
 * @param {number} calls
 * @param {number} gap
 * @returns {number}
 */
function exercise(fn,calls,gap) {
  let acc=0,input=0x43af78cd;
  for(let i=0;i<calls;i++) {
    input=(Math.imul(input,1664525)+1013904223)|0;
    acc^=fn(input);
    for(let j=0;j<gap;j++)acc=(Math.imul(acc,33)+i+j)|0;
  }
  return acc;
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/**
 * @param {(x:number)=>number} fn
 * @param {number} gap
 * @returns {{medianMs:number,checksum:number,trialsMs:number[]}}
 */
function measure(fn,gap) {
  const count=250000;
  const target=exercise(fn,count,gap);
  for(let i=0;i<3;i++)assert.equal(exercise(fn,count,gap),target);
  const trials=[];
  for(let i=0;i<7;i++) {
    const start=performance.now();
    const checksum=exercise(fn,count,gap);
    const elapsed=performance.now()-start;
    assert.equal(checksum,target);
    trials.push(elapsed);
  }
  return {medianMs:median(trials),checksum:target,trialsMs:trials};
}

/** @returns {void} */
function main() {
  const original=fs.readFileSync(path.join(__dirname,
    '../examples/polyvariant-affine/original.cjs'),'utf8').replace(/\r\n/g,'\n');
  const native=load(original);
  /** @type {{variants:number,codeBytes:number,functions:number,paths:number,callMs:number,mixedMs:number,callRatio:number,mixedRatio:number}[]} */
  const results=[];
  for(const variants of [2,4,8]) {
    const transformed=lowerPolyvariantAffine(original,'commonjs',{
      seed:'measured-polyvariant-2026-11-16',names:['guardedTotal'],
      variants:/** @type {2|4|8} */ (variants)
    });
    const fn=load(transformed.code);
    const nativeDense=measure(native,0);
    const guardedDense=measure(fn,0);
    const nativeMixed=measure(native,8);
    const guardedMixed=measure(fn,8);
    assert.equal(guardedDense.checksum,nativeDense.checksum);
    assert.equal(guardedMixed.checksum,nativeMixed.checksum);
    results.push({
      variants,codeBytes:Buffer.byteLength(transformed.code,'utf8'),
      functions:transformed.functions,paths:transformed.paths,
      callMs:guardedDense.medianMs,mixedMs:guardedMixed.medianMs,
      callRatio:guardedDense.medianMs/nativeDense.medianMs,
      mixedRatio:guardedMixed.medianMs/nativeMixed.medianMs
    });
  }
  process.stdout.write(JSON.stringify({
    engine:process.version,platform:process.platform,
    method:'7-trial median of each 250000-call deterministic workload, warmup 3',
    results
  },null,2)+'\n');
}

main();
