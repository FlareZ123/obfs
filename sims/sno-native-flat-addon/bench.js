'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const {performance}=require('node:perf_hooks');

const addon=require(path.join(__dirname,'build','Release','sno_native_flat.node'));

/**
 * @param {Int32Array} values
 * @param {number} rounds
 * @returns {number}
 */
function original(values,rounds){
  let accumulator=0x13579bdf|0;
  for(let round=0;round<rounds;round++){
    for(let index=0;index<values.length;index++){
      const value=values[index]|0;
      if((value&1)===0){
        accumulator=(Math.imul(accumulator^value,1664525)+1013904223)|0;
      }else{
        accumulator=(Math.imul((accumulator+value)|0,1103515245)^12345)|0;
      }
      accumulator=(accumulator^(accumulator>>>13))|0;
    }
  }
  return accumulator|0;
}

/** @param {number} seed @param {number} length @returns {Int32Array} */
function values(seed,length){
  let state=seed|0;
  const output=new Int32Array(length);
  for(let index=0;index<length;index++){
    state=(Math.imul(state,1664525)+1013904223)|0;
    output[index]=state;
  }
  return output;
}

/** @param {number[]} samples @returns {number} */
function median(samples){
  const sorted=[...samples].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * @param {(values:Int32Array,rounds:number)=>number} fn
 * @param {Int32Array} input
 * @param {number} rounds
 * @returns {number}
 */
function timed(fn,input,rounds){
  const started=performance.now();
  const result=fn(input,rounds);
  const elapsed=performance.now()-started;
  if(!Number.isInteger(result))throw new TypeError('Expected int32 result');
  return elapsed;
}

for(let caseIndex=0;caseIndex<24;caseIndex++){
  const input=values((0x2468ace+caseIndex*977)|0,(caseIndex*7)%31);
  const rounds=1+(caseIndex%7);
  assert.equal(addon.transform(input,rounds),original(input,rounds),
    'Native parity mismatch at case '+caseIndex);
}

const input=values(0x10293847,256);
const rounds=50000;
for(let warm=0;warm<5;warm++){
  assert.equal(addon.transform(input,200),original(input,200));
}
const originalMs=[];
const protectedMs=[];
for(let trial=0;trial<9;trial++){
  const order=trial%2===0?['original','protected']:['protected','original'];
  for(const arm of order){
    if(arm==='original')originalMs.push(timed(original,input,rounds));
    else protectedMs.push(timed(addon.transform,input,rounds));
  }
}
const originalMedian=median(originalMs);
const protectedMedian=median(protectedMs);
process.stdout.write('SNO_NATIVE_FLAT_CANDIDATE '+JSON.stringify({
  node:process.version,
  platform:process.platform,
  arch:process.arch,
  parityCases:24,
  inputLength:input.length,
  rounds,
  warmMs:{original:originalMedian,protected:protectedMedian},
  protectedOriginalRatio:protectedMedian/originalMedian
})+'\n');
