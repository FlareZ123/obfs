'use strict';

const {performance}=require('node:perf_hooks');
const {createHash}=require('node:crypto');
const assert=require('node:assert/strict');
const native=require('../examples/statement-flow/before/router.cjs').route;
const transformed=require('../examples/statement-flow/after/router.cjs').route;

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Fully execute the original callback contract, including expensive host work
 * when requested. Native and transformed runs use identical input sequences.
 * @param {(value:number,flag:boolean,hook:(value:string)=>void)=>number} fn
 * @param {number} iterations
 * @param {boolean} heavy
 * @returns {{ms:number,checksum:number}}
 */
function measure(fn,iterations,heavy){
  let checksum=0;
  const start=performance.now();
  for(let index=0;index<iterations;index++){
    const value=(index&1023)-512;
    const flag=(index%7)<3;
    let observed=0;
    const hook=/** @param {string} tag */ tag=>{
      if(heavy){
        observed=createHash('sha256').update(tag).update(String(value)).digest()[0];
      }else{
        observed=tag.length;
      }
    };
    checksum=(checksum+fn(value,flag,hook)+observed)|0;
  }
  return {ms:performance.now()-start,checksum};
}

/** @typedef {{name:string,iterations:number,heavy:boolean}} Profile */
const profiles=/** @type {Profile[]} */([
  {name:'hot-light-callback',iterations:1200000,heavy:false},
  {name:'integrated-cryptographic-host-callback',iterations:100000,heavy:true}
]);
/** @type {Record<string,unknown>[]} */
const records=[];
for(const profile of profiles){
  /** @type {number[]} */
  const original=[];
  /** @type {number[]} */
  const obfuscated=[];
  for(let trial=0;trial<6;trial++){
    for(const implementation of trial%2?[transformed,native]:[native,transformed]){
      measure(implementation,20000,profile.heavy);
      const measured=measure(implementation,profile.iterations,profile.heavy);
      if(implementation===native)original.push(measured.ms);
      else obfuscated.push(measured.ms);
      const control=measure(native,4096,profile.heavy);
      const candidate=measure(transformed,4096,profile.heavy);
      assert.equal(candidate.checksum,control.checksum);
    }
  }
  const nativeMedian=median(original);
  const transformedMedian=median(obfuscated);
  records.push({
    profile:profile.name,iterations:profile.iterations,
    nativeMedianMs:nativeMedian,transformedMedianMs:transformedMedian,
    ratio:transformedMedian/nativeMedian,
    passes2_5x:transformedMedian<=2.5*nativeMedian,
    original,obfuscated
  });
}
process.stdout.write(JSON.stringify({node:process.version,records},null,2)+'\n');
if(process.env.OBFS_ENFORCE_BUDGET==='1'&&records.some(row=>row.passes2_5x!==true)){
  process.stderr.write('Statement CFG violates the sampled 2.5x budget\n');
  process.exitCode=1;
}
