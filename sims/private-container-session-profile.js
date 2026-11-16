'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {createContext,Script}=require('node:vm');
const {obfuscateFiles}=require('../src');

const templates={
  tuple:[
    'const owner={hiddenCount:11,privateDelta:5};',
    'const carrier=[false,"metadata",owner,null];',
    'const alias=carrier[2];',
    'module.exports=function score(n){let x=0;for(let i=0;i<n;i++)x=(x+((alias.hiddenCount+i)&255)+owner.privateDelta)|0;return x;}'
  ].join('\n'),
  record:[
    'const owner={hiddenCount:11,privateDelta:5};',
    'const carrier={tag:"metadata",owned:owner,active:false};',
    'const alias=carrier.owned;',
    'module.exports=function score(n){let x=0;for(let i=0;i<n;i++)x=(x+((alias.hiddenCount+i)&255)+owner.privateDelta)|0;return x;}'
  ].join('\n')
};

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Each independent sample allocates a fresh realm, parses the source into
 * a fresh Script, evaluates module initialization and completes the workload.
 * It deliberately measures cold execution and excludes build-time tooling.
 * @param {string} source
 * @param {number} operations
 * @returns {number}
 */
function runFresh(source,operations){
  const scope=createContext({module:{exports:null}});
  new Script(source,{filename:'container-budget.cjs'}).runInContext(scope,{timeout:15000});
  const score=/** @type {(n:number)=>number} */(scope.module.exports);
  return score(operations);
}

/**
 * @param {string} code
 * @param {number} operations
 * @param {number} repeats
 * @param {number} expected
 * @returns {number}
 */
function timedBatch(code,operations,repeats,expected){
  const t0=performance.now();
  for(let i=0;i<repeats;i++) {
    assert.equal(runFresh(code,operations),expected,
      'Native/obfuscated full-session mismatch for '+operations+' operations');
  }
  return performance.now()-t0;
}

/**
 * @returns {{
 *   node:string,platform:string,repeats:number,rounds:number,
 *   measurements:{carrier:string,operations:number,sourceBytes:number,emittedBytes:number,
 *     fields:number,medianNativeMs:number,medianEmittedMs:number,ratio:number,
 *     within2point5:boolean,ratios:number[]}[]
 * }}
 */
function runProfile(){
  const repeats=12,rounds=9;
  /** @type {ReturnType<typeof runProfile>['measurements']} */
  const measurements=[];
  for(const [carrier,source] of Object.entries(templates)){
    const compiled=obfuscateFiles([{path:'container-budget.cjs',
      sourceType:'commonjs',code:source}],{
      mode:'coo',seed:'container-budget-batched-'+carrier,
      properties:true,strings:false,identifiers:false
    });
    const emitted=String(compiled.files[0].code);
    const fields=compiled.files[0].metrics.properties;
    assert.equal(fields,2,carrier+' owner proof did not rename both fields');
    assert.doesNotMatch(emitted,/hiddenCount|privateDelta/u);
    for(const operations of [1,100,10000,500000]){
      const expected=runFresh(source,operations);
      // Warm the measurement harness without preinitializing the modules
      // measured in each timed batch.
      timedBatch(source,operations,2,expected);
      timedBatch(emitted,operations,2,expected);
      const native=[],changed=[];
      for(let round=0;round<rounds;round++){
        for(const side of round%2===0?['native','changed']:['changed','native']){
          const elapsed=timedBatch(side==='native'?source:emitted,
            operations,repeats,expected);
          (side==='native'?native:changed).push(elapsed);
        }
      }
      const medianNativeMs=median(native),medianEmittedMs=median(changed);
      measurements.push({
        carrier,operations,sourceBytes:Buffer.byteLength(source),
        emittedBytes:Buffer.byteLength(emitted),fields,
        medianNativeMs,medianEmittedMs,
        ratio:medianEmittedMs/medianNativeMs,
        within2point5:medianEmittedMs<=2.5*medianNativeMs,
        ratios:changed.map((ms,index)=>ms/native[index])
      });
    }
  }
  return {node:process.version,platform:process.platform,repeats,rounds,measurements};
}

if(require.main===module){
  process.stdout.write('PRIVATE_CONTAINER_BATCHED_COLD '+JSON.stringify(runProfile())+'\n');
}

module.exports={runProfile};
