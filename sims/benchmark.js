'use strict';
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const vm = require('node:vm');
const { transform } = require('../lib/transform');

/** @type {Record<string, string>} */
const workloads = {
  numeric: `(function workload(n) {const state={secret:1,step:7};for(let i=0;i<n;i++){state.secret+=7;state.step++;}return state.secret;})`,
  alias: `(function workload(n) {const state={secret:17};const a=state;let sum=0;for(let i=0;i<n;i++){a.secret++;sum^=state.secret;}return sum;})`,
  bracket: `(function workload(n) {const state={secret:1,step:3};let s=0;for(let i=0;i<n;i++){state['secret']+=3;s^=state['secret'];}return s;})`,
  calls: `(function workload(n) {function identity(p){return p;}const state={secret:1};let s=0;for(let i=0;i<n;i++){identity(state).secret++;s ^= state.secret;}return s;})`,
};
/** @param {number[]} a @returns {number} */
const median = a => [...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
/** @param {Function} fn @param {number} n @returns {number} */
function time(fn, n) {
  const start = performance.now();
  fn(n);
  return performance.now()-start;
}
/** @param {string} label @param {string} source */
function run(label, source) {
  const transformed=transform({ 'bench.mjs':source },{closedWorld:true,seed:'performance-stable'});
  if (transformed.renamed === 0) throw new Error('Benchmark did not obfuscate ' + label);
  const original=vm.runInNewContext(source);
  const modified=vm.runInNewContext(transformed.files['bench.mjs']);
  const n=3_000_000;
  for(let i=0;i<12;i++) { assertSame(original(50_000),modified(50_000)); }
  const samplesOriginal=[];
  const samplesModified=[];
  for(let i=0;i<11;i++) {
    if(i%2===0){samplesOriginal.push(time(original,n));samplesModified.push(time(modified,n));}
    else{samplesModified.push(time(modified,n));samplesOriginal.push(time(original,n));}
  }
  assertSame(original(n), modified(n));
  const originalMs=median(samplesOriginal), obfuscatedMs=median(samplesModified);
  return { label,source_sha256:crypto.createHash('sha256').update(source).digest('hex'),renamed:transformed.renamed,
    iterations:n,median_original_ms:originalMs,median_obfuscated_ms:obfuscatedMs,ratio:obfuscatedMs/originalMs,
    passes_budget:obfuscatedMs/originalMs <= 2.5 };
}
/** @param {unknown} a @param {unknown} b */
function assertSame(a,b){ if(a!==b)throw new Error(`Mismatch: ${a} vs ${b}`); }
const result={node:process.version,platform:process.platform,architecture:process.arch,runtime_budget:2.5,
  trials:11,warmup:12,measurements:Object.entries(workloads).map(([name,src])=>run(name,src))};
console.log(JSON.stringify(result,null,2));
