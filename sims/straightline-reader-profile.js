'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');

const original=[
  "'use strict';",
  'const owner={secretAlpha:23};',
  'function read(incoming){return incoming.secretAlpha;}',
  'module.exports=function calculate(x){return read(owner)+((x*17)&255);};'
].join('\n');

/** @param {string} code @returns {(value:number)=>number} */
function load(code){
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:5000});
  if(typeof context.module.exports!=='function')throw new TypeError('Expected function export');
  return /** @type {(value:number)=>number} */ (context.module.exports);
}

/**
 * A native arithmetic consumer invokes the same compiled function in both
 * variants. A digest prevents replacing the executed calls with an unused loop.
 * @param {(value:number)=>number} fn
 * @param {number} count
 * @returns {number}
 */
function exercise(fn,count){
  let digest=0;
  for(let index=0;index<count;index++){
    digest=(digest+fn(index&1023))|0;
  }
  return digest;
}

/** @param {number[]} numbers @returns {number} */
function median(numbers){
  const values=[...numbers].sort((a,b)=>a-b);
  return values[Math.floor(values.length/2)];
}

/** @param {(value:number)=>number} fn @param {number} count @returns {{digest:number,cpuMs:number}} */
function sample(fn,count){
  const start=process.cpuUsage();
  const digest=exercise(fn,count);
  const elapsed=process.cpuUsage(start);
  return {digest,cpuMs:(elapsed.user+elapsed.system)/1000};
}

/** @returns {object} */
function run(){
  const compiled=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:original}],{
    mode:'coo',strings:false,identifiers:false,seed:'straightline-reader-cpu-20261118'
  }).files[0];
  assert.equal(compiled.metrics.objects,1);
  assert.equal(compiled.metrics.properties,1);
  const native=load(original);
  const protectedFn=load(/** @type {string} */ (compiled.code));
  for(let i=-1024;i<=1024;i++){
    assert.equal(protectedFn(i),native(i),'Held-out native generated parity at '+i);
  }
  exercise(native,100000);
  exercise(protectedFn,100000);
  const cycles=16000000;
  const pairs=11;
  /** @type {number[]} */
  const nativeCpuMs=[];
  /** @type {number[]} */
  const candidateCpuMs=[];
  for(let index=0;index<pairs;index++){
    /** @type {{digest:number,cpuMs:number}} */
    let baseline;
    /** @type {{digest:number,cpuMs:number}} */
    let candidate;
    if(index%2===0){
      baseline=sample(native,cycles);
      candidate=sample(protectedFn,cycles);
    }else{
      candidate=sample(protectedFn,cycles);
      baseline=sample(native,cycles);
    }
    assert.equal(candidate.digest,baseline.digest,'Executed-call checksum parity');
    nativeCpuMs.push(baseline.cpuMs);
    candidateCpuMs.push(candidate.cpuMs);
  }
  const ratios=nativeCpuMs.map((ms,index)=>candidateCpuMs[index]/ms);
  const strictOverBudgetPairs=ratios.filter(ratio=>ratio>2.5).length;
  const result={
    node:process.version,platform:process.platform,
    originalBytes:Buffer.byteLength(original),
    emittedBytes:Buffer.byteLength(String(compiled.code)),
    selectedOwnFieldRewrites:compiled.metrics.properties,
    workload:'post-initialization hot function CPU; compilation, VM context setup and COO cold startup excluded',
    cyclesPerVariantPerPair:cycles,pairs,
    nativeCpuMs,candidateCpuMs,pairedRatios:ratios,
    ratioOfMedians:median(candidateCpuMs)/median(nativeCpuMs),
    maxPairedRatio:Math.max(...ratios),
    strictOverBudgetPairs
  };
  process.stdout.write('STRAIGHTLINE_READER_CPU '+JSON.stringify(result)+'\n');
  assert.equal(strictOverBudgetPairs,0,'Sampled direct hot compute exceeds the strict 2.5x ceiling');
  return result;
}

if(require.main===module)run();
module.exports={run,original};
