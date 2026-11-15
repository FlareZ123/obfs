'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {performance}=require('node:perf_hooks');

const folder=path.join(__dirname,'../examples/symbol-keys');
const native=fs.readFileSync(path.join(folder,'before.cjs'),'utf8');
const transformed=fs.readFileSync(path.join(folder,'after.cjs'),'utf8');

/** @param {string} source @returns {(x:number)=>number} */
function load(source) {
  const module=/** @type {{exports:unknown}} */ ({exports:null});
  new Function('module','exports',source)(module,module.exports);
  return /** @type {(x:number)=>number} */ (module.exports);
}
/** @param {(x:number)=>number} fn @param {number} count @returns {number} */
function work(fn,count) {
  let total=0;
  for(let i=0;i<count;i++)total+=fn(i&7);
  return total;
}
/** @param {(x:number)=>number} fn @param {number} count @returns {number} */
function time(fn,count) {
  const start=performance.now();
  work(fn,count);
  return performance.now()-start;
}
/** @param {number[]} samples @returns {number} */
const median=samples=>[...samples].sort((a,b)=>a-b)[Math.floor(samples.length/2)];

const original=load(native),candidate=load(transformed);
for(let i=0;i<8;i++){time(original,250000);time(candidate,250000);}
const originalTimes=[],candidateTimes=[];
for(let i=0;i<25;i++) {
  if(i&1){
    candidateTimes.push(time(candidate,250000));
    originalTimes.push(time(original,250000));
  }else{
    originalTimes.push(time(original,250000));
    candidateTimes.push(time(candidate,250000));
  }
}
const baseline=median(originalTimes),obfuscated=median(candidateTimes);
const report={node:process.version,platform:process.platform,
  callsPerSample:250000,samplesPerVariant:25,
  nativeMedianMs:baseline,obfuscatedMedianMs:obfuscated,
  ratio:obfuscated/baseline,originalBytes:Buffer.byteLength(native),
  transformedBytes:Buffer.byteLength(transformed),
  checksumEquivalent:work(load(native),10000)===work(load(transformed),10000)};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
if(!report.checksumEquivalent)process.exitCode=1;
