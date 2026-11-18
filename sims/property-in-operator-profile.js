'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');

/**
 * A small closed-world hot-loop workload using both a private field and its
 * guaranteed-own-key presence check. Identical source and public contract
 * are used for the native and emitted tests.
 */
const source=`'use strict';
const bag={secretField:19};
module.exports=function run(count){
  let result=0;
  for(let i=0;i<count;i++){
    if("secretField" in bag)result=(result+bag.secretField+(i&7))|0;
  }
  return result;
};
`;

/**
 * @param {string} code
 * @returns {(count:number)=>number}
 */
function load(code){
  /** @type {{exports:unknown}} */
  const module={exports:null};
  vm.runInNewContext(code,{module},{timeout:10000});
  assert.equal(typeof module.exports,'function');
  return /** @type {(count:number)=>number} */ (module.exports);
}

/**
 * @param {number[]} values
 * @returns {number}
 */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * @param {(count:number)=>number} run
 * @param {number} iterations
 * @returns {number}
 */
function sample(run,iterations){
  const start=performance.now();
  const result=run(iterations);
  if(typeof result!=='number')throw new TypeError('Invalid hot run output');
  return performance.now()-start;
}

/**
 * @param {'coo'|'sno'} mode
 */
function profile(mode){
  const transformed=obfuscateFiles([
    {path:'in-private.cjs',sourceType:'commonjs',code:source}
  ],{mode,seed:'private-in-cost-'+mode,strings:false,identifiers:false});
  const emitted=/** @type {string} */(transformed.files[0].code);
  assert.equal(transformed.files[0].metrics.properties,1);
  assert.doesNotMatch(emitted,/"secretField" in bag/u);
  const native=load(source);
  const protectedRun=load(emitted);
  for(const n of [0,1,13,100,100000]) {
    assert.equal(protectedRun(n),native(n));
  }
  for(const count of [1_000_000,10_000_000,25_000_000]){
    for(let warm=0;warm<7;warm++){
      assert.equal(native(count),protectedRun(count));
    }
    /** @type {number[]} */
    const originals=[];
    /** @type {number[]} */
    const emittedTimes=[];
    for(let trial=0;trial<13;trial++){
      const order=trial%2===0?
        [[native,originals],[protectedRun,emittedTimes]]:
        [[protectedRun,emittedTimes],[native,originals]];
      for(const [runner,times] of /** @type {Array<[(count:number)=>number,number[]]>} */ (order)){
        times.push(sample(runner,count));
      }
    }
    const n=median(originals);
    const e=median(emittedTimes);
    console.log('OWN_IN_OPERATOR_PROFILE '+JSON.stringify({
      mode,count,sourceBytes:Buffer.byteLength(source),
      emittedBytes:Buffer.byteLength(emitted),nativeMedianMs:n,
      emittedMedianMs:e,ratioOfMedians:e/n,
      nativeSamplesMs:originals,emittedSamplesMs:emittedTimes,
      boundary:'warm in-process Node VM function loops; excludes startup, network, and other application work'
    }));
  }
}

profile('coo');
profile('sno');
