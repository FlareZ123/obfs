'use strict';

const {performance}=require('node:perf_hooks');
const native=require('../examples/branch-blocks/before/gate.cjs').gate;
const obfuscated=require('../examples/branch-blocks/after/gate.cjs').gate;
const masked=require('../examples/branch-blocks/after/gate-masked.cjs').gate;
const ITERATIONS=12000000;

/** @typedef {{name:string,inputs:(index:number)=>unknown}} Profile */
/** @param {number[]} samples @returns {number} */
function median(samples){
  const sorted=[...samples].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Alternating warmed samples exclude startup parsing, like a long-running
 * SNO library. This is a focused test, not an application-wide proof.
 * @param {(value:unknown)=>number} fn
 * @param {Profile} profile
 * @param {number} count
 * @returns {{ms:number,checksum:number}}
 */
function run(fn,profile,count){
  let checksum=0;
  const start=performance.now();
  for(let i=0;i<count;i++)checksum=(checksum+Number(fn(profile.inputs(i))))|0;
  return {ms:performance.now()-start,checksum};
}

const profiles=/** @type {Profile[]} */ ([
  {name:'mixed-positive-and-negative',inputs:i=>(i&1023)-512},
  {name:'alternating-branch-bias',inputs:i=>i&1?0:5},
  {name:'numeric-and-string-coercion',inputs:i=>i&7?i&255:String(i&255)}
]);
/** @type {Record<string,unknown>[]} */
const results=[];
for(const profile of profiles){
  const timing={native:/** @type {number[]} */([]),obfuscated:/** @type {number[]} */([]),masked:/** @type {number[]} */([])};
  for(let trial=0;trial<6;trial++){
    const order=trial%3===0?['native','obfuscated','masked']:
      trial%3===1?['masked','native','obfuscated']:['obfuscated','masked','native'];
    for(const kind of order){
      const fn=kind==='native'?native:kind==='masked'?masked:obfuscated;
      run(fn,profile,100000);
      const outcome=run(fn,profile,ITERATIONS);
      timing[/** @type {'native'|'obfuscated'|'masked'} */(kind)].push(outcome.ms);
      if(run(native,profile,1000).checksum!==run(obfuscated,profile,1000).checksum||
          run(native,profile,1000).checksum!==run(masked,profile,1000).checksum){
        throw new Error('Behavior mismatch for '+profile.name);
      }
    }
  }
  const nativeMs=median(timing.native);
  const obfuscatedMs=median(timing.obfuscated);
  const maskedMs=median(timing.masked);
  results.push({name:profile.name,node:process.version,iterations:ITERATIONS,
    nativeMedianMs:nativeMs,obfuscatedMedianMs:obfuscatedMs,
    slowdown:obfuscatedMs/nativeMs,
    withinBudget:obfuscatedMs/nativeMs<=2.5,
    maskedMedianMs:maskedMs,maskedSlowdown:maskedMs/nativeMs,
    maskedWithinBudget:maskedMs/nativeMs<=2.5,
    samples:timing});
}
console.log(JSON.stringify(results,null,2));
if(process.env.OBFS_ENFORCE_BUDGET==='1' &&
    results.some(result=>result.withinBudget!==true||result.maskedWithinBudget!==true)) {
  process.stderr.write('Native superblock experiment exceeds 2.5x in measured hot profile\n');
  process.exitCode=1;
}
