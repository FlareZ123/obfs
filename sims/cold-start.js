'use strict';

const {performance} = require('node:perf_hooks');
const {Script} = require('node:vm');
const {createHash} = require('node:crypto');
const assert = require('node:assert/strict');
const {obfuscateFiles} = require('../src');

/** @typedef {{name:string,source:string}} Workload */
/** @param {number} size @returns {string} */
function sampleString(size) {
  return Array.from({length:size},(_,index)=>String.fromCharCode(65+index%26)).join('');
}

/** @returns {Workload[]} */
function workloads() {
  const chunks=Array.from({length:256},(_,index)=>JSON.stringify(
    sampleString(256).slice(index%11)+String(index).padStart(3,'0')));
  return [
    {name:'single-4KiB',source:`globalThis.payload=${JSON.stringify(sampleString(4096))};`},
    {name:'single-64KiB',source:`globalThis.payload=${JSON.stringify(sampleString(65536))};`},
    {name:'256-distinct-strings',source:`globalThis.payload=[${chunks.join(',')}].length;`},
    {name:'trivial-constant',source:`globalThis.payload='long-static-literal';`}
  ];
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((left,right)=>left-right);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Measure only executed JS after parsing and compiling outside the timer.
 * New realms ensure that the one-time decoder runs during each trial,
 * as it does when an independently loaded client starts from cold state.
 * @param {Script} script
 * @returns {{samples:number[],last:string}}
 */
function measure(script) {
  /** @type {number[]} */
  const samples=[];
  let last='';
  for(let iteration=0;iteration<16;iteration++) {
    /** @type {{payload?:string|number}} */
    const context={};
    const start=performance.now();
    script.runInNewContext(context,{timeout:3000});
    const elapsed=performance.now()-start;
    last=String(context.payload);
    if(iteration>=5)samples.push(elapsed);
  }
  return {samples,last};
}

/** @param {Workload} workload */
function run(workload) {
  const obfuscated=obfuscateFiles([
    {path:'cold.js',sourceType:'script',code:workload.source}
  ],{mode:'coo',seed:'cold-start-benchmark',properties:false}).files[0];
  const originalScript=new Script(workload.source);
  const obfuscatedScript=new Script(String(obfuscated.code));
  // Alternate evaluation order between two complete sample groups.
  const original1=measure(originalScript);
  const obfuscated1=measure(obfuscatedScript);
  const obfuscated2=measure(obfuscatedScript);
  const original2=measure(originalScript);
  assert.equal(original1.last,obfuscated1.last);
  assert.equal(original2.last,obfuscated2.last);
  const baseline=median([...original1.samples,...original2.samples]);
  const transformed=median([...obfuscated1.samples,...obfuscated2.samples]);
  return {
    workload:workload.name,
    source_sha256:createHash('sha256').update(workload.source).digest('hex'),
    literals_obfuscated:obfuscated.metrics.literals,
    original_source_bytes:Buffer.byteLength(workload.source),
    obfuscated_source_bytes:Buffer.byteLength(String(obfuscated.code)),
    warmup_per_group:5,measured_per_group:11,groups_per_variant:2,
    original_median_ms:baseline,obfuscated_median_ms:transformed,
    observed_ratio:transformed/baseline,observed_beyond_2_5x:transformed/baseline>2.5
  };
}

const result={
  purpose:'illustrative COO cold-start runtime, not a universal performance guarantee',
  node:process.version,platform:process.platform,arch:process.arch,
  excludes_js_compilation:true,
  samples:workloads().map(run)
};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
