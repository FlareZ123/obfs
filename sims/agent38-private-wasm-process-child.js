'use strict';

const fs=require('node:fs');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');

/**
 * @param {(x:number)=>number} fn
 * @param {number} count
 * @returns {number}
 */
function work(fn,count) {
  let checksum=0;
  for(let i=0;i<count;i++)checksum=(checksum^fn((i*1664525)|0))|0;
  return checksum;
}

/** @returns {void} */
function main() {
  /** @type {{source:string,calls:number}} */
  const input=JSON.parse(fs.readFileSync(0,'utf8'));
  const sandbox={module:{exports:null},globalThis};
  const before=performance.now();
  vm.runInNewContext(input.source,sandbox,{timeout:5000});
  const after=performance.now();
  const fn=/** @type {(x:number)=>number} */(
    /** @type {unknown} */ (sandbox.module.exports));
  const firstResult=fn(42);
  const afterFirst=performance.now();
  for(let i=0;i<3;i++)work(fn,input.calls);
  const start=performance.now();
  const checksum=work(fn,input.calls);
  const finish=performance.now();
  process.stdout.write(JSON.stringify({
    pid:process.pid,node:process.version,
    initializeMs:after-before,firstCallMs:afterFirst-after,
    hotMs:finish-start,firstResult,checksum
  }));
}

if(require.main===module)main();
module.exports={work,main};
