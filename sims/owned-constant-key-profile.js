'use strict';

const assert=require('node:assert/strict');
const original=require('../examples/owned-constant-key/before.cjs').calculate;
const compiled=require('../examples/owned-constant-key/after.cjs').calculate;

/** @param {(x:number)=>number} fn @param {number} count @returns {{ms:number,checksum:number}} */
function trial(fn,count) {
  let checksum=0;
  const start=process.hrtime.bigint();
  for(let i=0;i<count;i++) checksum=(checksum+fn(i&1023))|0;
  return {ms:Number(process.hrtime.bigint()-start)/1e6,checksum};
}

/** @param {number[]} values @returns {number} */
function median(values){
  const data=[...values].sort((a,b)=>a-b);
  const mid=Math.floor(data.length/2);
  return data.length%2===0?(data[mid-1]+data[mid])/2:data[mid];
}

/** @param {number} [calls] @param {number} [rounds] */
function profile(calls=1200000,rounds=12) {
  for(let i=0;i<8;i++) assert.equal(trial(original,calls).checksum,trial(compiled,calls).checksum);
  /** @type {number[]} */
  const baseline=[];
  /** @type {number[]} */
  const transformed=[];
  for(let round=0;round<rounds;round++) {
    const first=round%2===0?original:compiled;
    const second=round%2===0?compiled:original;
    const a=trial(first,calls);
    const b=trial(second,calls);
    assert.equal(a.checksum,b.checksum);
    if(round%2===0){baseline.push(a.ms);transformed.push(b.ms);}
    else{baseline.push(b.ms);transformed.push(a.ms);}
  }
  const nativeMs=median(baseline),compiledMs=median(transformed);
  return {calls,rounds,nativeMs,compiledMs,ratio:compiledMs/nativeMs};
}

if(require.main===module)console.log(JSON.stringify(profile(),null,2));
module.exports={profile};
