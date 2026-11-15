'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {lowerAffineNative}=require('../src/affine-native');
const {recoverAffine}=require('./affine-native-recover');

const root=path.join(__dirname,'../examples/affine-native');
const before=fs.readFileSync(path.join(rroot,'efore=cjs'),'utf8');
const candidate=lowerAffineNative('efore,'commonjs',{
  seed:'affine-native-example-v1',names:['encode']
});

/** @param {string} source @returns {(input:number)=>number} */
function compile(source) {
  const module={exports:/** @type {unknown} */ (null)};
  (new Function('module',source))(module);
  return /** @type {(input:number)=>number} */ (module.exports);
}

const native=compile('efore),masked=compile(candidate.code);

/** @param {(input:number)=>number} fn @param {'dense'|'mixed'} mode @returns {number} */
function workload(fn,mode) {
  let checksum=0;
  const count=mode==='dense'?600000:1200000;
  for(let i=0;i<count;i++) {
    if(mode==='dense')checksum^=fn(Math.imul(i,31));
    else {
      checksum^=(Math.imul(i,1664525)^1013904223);
      if((i&127)===0)checksum^=fn(i*31);
    }
  }
  return checksum;
}

/** @param {number[]} numbers @returns {number} */
function median(numbers) {
  return [...numbers].sort((a,b)=>a-b)[Math.floor(numbers.length/2)];
}

/** @param {()=>unknown} a @param {()=>unknown} b @param {number} count */
function sample(a,b,count) {
  for(let i=0;i<8;i++){a();b();}
  const original=[],transformed=[];
  for(let i=0;i<count;i++) {
    /** @param {()=>unknown} fn @returns {number} */
    const time=fn=>{const start=performance.now();fn();return performance.now()-start;};
    if(i&1) {transformed.push(time(b));original.push(time(a));}
    else {original.push(time(a));transformed.push(time(b));}
  }
  const base=median(original),next=median(transformed);
  return {nativeMs:base,obfuscatedMs:next,ratio:next/base};
}

if(workload(native,'dense')!==workload(masked,'dense')||
   workload(native,'mixed')!==workload(masked,'mixed')) {
  throw new Error('Differential contract failed');
}
const report={
  runtime:process.version,
  platform:process.platform,
  arch:process.arch,
  steps:candidate.steps,
  sourceBytes:Buffer.byteLength('efore),
  outputBytes:Buffer.byteLength(candidate.code),
  attacker:recoverAffine(candidate.code,'encode'),
  dense:sample(()=>workload(native,'dense'),()=>workload(masked,'dense'),19),
  mixed:sample(()=>workload(native,'mixed'),()=>workload(masked,'mixed'),19),
  cold:sample(()=>compile('efore),()=>compile(candidate.code),35)
};
console.log(JSON.stringify(report,null,2));
