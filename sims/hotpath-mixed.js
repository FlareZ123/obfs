'use strict';

const assert = require('node:assert/strict');
const {performance} = require('node:perf_hooks');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const {obfuscateFiles} = require('../src');

/** @typedef {{name:string,source:string,iterations:number}} Workload */

/** @returns {Workload[]} */
function workloads() {
  return [
    {
      name:'numeric-owned-object',
      iterations:1_000_000,
      source:`'use strict';module.exports=function workload(n){
        const state={counter:0,increment:7};
        for(let i=0;i<n;i++){state.counter+=state.increment;state.increment+=i&1;}
        return state.counter;
      };`
    },
    {
      name:'interprocedural-alias',
      iterations:1_000_000,
      source:`'use strict';function identity(p){return p;}
        module.exports=function workload(n){
        const local={value:23,step:2};const alias=identity(local);
        let result=0;for(let i=0;i<n;i++){alias.value+=alias.step;result^=local.value;}
        return result;
      };`
    },
    {
      name:'local-immutable-arrow-identity',
      iterations:1_000_000,
      source:`'use strict';module.exports=function workload(n){
        const state={secretMetric:21,adjustment:7};
        const relay=value=>value;
        const view=relay(state);
        let total=0;
        for(let i=0;i<n;i++){view.secretMetric+=view.adjustment;total^=state.secretMetric;}
        return total;
      };`
    },
    {
      name:'local-immutable-function-expression',
      iterations:1_000_000,
      source:`'use strict';module.exports=function workload(n){
        const state={secretMetric:21,adjustment:7};
        const relay=function(value){return value;};
        const view=relay(state);
        let total=0;
        for(let i=0;i<n;i++){view.secretMetric+=view.adjustment;total^=state.secretMetric;}
        return total;
      };`
    },
    {
      name:'unicode-length-scan',
      iterations:100_000,
      source:`'use strict';module.exports=function workload(n){
        const data='correct-𝄞-😀-\uD800-encoded-UTF16';
        let total=0;for(let i=0;i<n;i++){total+=data.charCodeAt(i%data.length);}
        return total;
      };`
    },
    {
      name:'array-reduction',
      iterations:200_000,
      source:`'use strict';module.exports=function workload(n){
        const entries=[5,8,13,21,34,55,89,144,233];
        let total=0;
        for(let i=0;i<n;i++){total+=entries[i%entries.length]^(i&255);}
        return total;
      };`
    },
    {
      name:'external-property-calls',
      iterations:250_000,
      source:`'use strict';module.exports=function workload(n){
        let sum=0;for(let i=0;i<n;i++){sum+=window.externalValue(i);}
        return sum;
      };`
    },
    {
      name:'reflection-safe-fallback',
      iterations:100_000,
      source:`'use strict';module.exports=function workload(n){
        const record={fieldName:11,otherField:17};
        let total=0;
        for(let i=0;i<n;i++){total+=record.fieldName;if(i%100===0)total+=Object.keys(record).length;}
        return total;
      };`
    }
  ];
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/** @param {string} code @returns {(n:number)=>number} */
function compile(code) {
  /** @type {{module:{exports:unknown},window:{externalValue:(n:number)=>number}}} */
  const context={
    module:{exports:null},
    window:{externalValue:(n)=>((n*17)%19)}
  };
  vm.runInNewContext(code,context,{timeout:3000});
  assert.equal(typeof context.module.exports,'function');
  return /** @type {(n:number)=>number} */ (context.module.exports);
}

/** @param {(n:number)=>number} work @param {number} n @returns {number} */
function measure(work,n) {
  const begin=performance.now();
  work(n);
  return performance.now()-begin;
}

/** @param {Workload} item */
function run(item) {
  const transformed=obfuscateFiles([
    {path:'module.cjs',sourceType:'commonjs',code:item.source}
  ],{mode:'sno',seed:'hotpath-evaluation',strings:false}).files[0];
  if(item.name.startsWith('local-immutable-'))assert.equal(transformed.metrics.properties,2);
  const baseline=compile(item.source), obfuscated=compile(transformed.code);
  assert.equal(baseline(item.iterations),obfuscated(item.iterations));
  for(let i=0;i<8;i++){
    baseline(Math.max(10,Math.floor(item.iterations/8)));
    obfuscated(Math.max(10,Math.floor(item.iterations/8)));
  }
  /** @type {number[]} */
  const baselineTimes=[],obfuscatedTimes=[];
  for(let i=0;i<15;i++){
    if(i%2===0){
      baselineTimes.push(measure(baseline,item.iterations));
      obfuscatedTimes.push(measure(obfuscated,item.iterations));
    }else{
      obfuscatedTimes.push(measure(obfuscated,item.iterations));
      baselineTimes.push(measure(baseline,item.iterations));
    }
  }
  const before=median(baselineTimes),after=median(obfuscatedTimes);
  return {
    workload:item.name,
    source_sha256:createHash('sha256').update(item.source).digest('hex'),
    iterations:item.iterations,
    source_bytes:Buffer.byteLength(item.source),
    obfuscated_bytes:Buffer.byteLength(transformed.code),
    renaming_metrics:transformed.metrics,
    median_original_ms:before,
    median_obfuscated_ms:after,
    observed_runtime_ratio:after/before,
    observed_within_2_5x:after/before<=2.5,
    baseline_samples_ms:baselineTimes,
    obfuscated_samples_ms:obfuscatedTimes
  };
}

const report={
  scope:'steady-state SNO execution after compilation and one-time initialization',
  environment:{node:process.version,platform:process.platform,arch:process.arch},
  warmup:8,trials:15,
  measurements:workloads().map(run)
};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
