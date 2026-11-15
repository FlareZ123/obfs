'use strict';

const assert=require('node:assert/strict');
const original=require('../examples/primitive-coercer/before.cjs').calculate;
const compiled=require('../examples/primitive-coercer/after.cjs').calculate;

/** @param {(x:number)=>number} fn @param {number} count @returns {{ms:number,sum:number}} */
function trial(fn,count) {
  let sum=0;
  const start=process.hrtime.bigint();
  for(let index=0;index<count;index++)sum=(sum+fn(index&1023))|0;
  const elapsed=Number(process.hrtime.bigint()-start)/1e6;
  return {ms:elapsed,sum};
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}

/** @param {number} [count] @param {number} [rounds] */
function profile(count=300000,rounds=12) {
  const warmups=6;
  for(let i=0;i<warmups;i++){
    const a=trial(original,count),b=trial(compiled,count);
    assert.equal(a.sum,b.sum);
  }
  /** @type {number[]} */
  const before=[];
  /** @type {number[]} */
  const after=[];
  for(let i=0;i<rounds;i++) {
    const first=i%2===0?original:compiled;
    const second=i%2===0?compiled:original;
    const a=trial(first,count),b=trial(second,count);
    assert.equal(a.sum,b.sum);
    if(i%2===0){before.push(a.ms);after.push(b.ms);}
    else{before.push(b.ms);after.push(a.ms);}
  }
  return {callsPerTrial:count,rounds,baselineMs:median(before),
    obfuscatedMs:median(after),ratio:median(after)/median(before)};
}

if(require.main===module)console.log(JSON.stringify(profile(),null,2));
module.exports={profile};
