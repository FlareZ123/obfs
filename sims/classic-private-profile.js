'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');

/** A browser-style classic script with a private per-call object. */
const source='function compute(x){const state={secretField:11,bonusField:3};' +
  'return state.secretField*x+state.bonusField;}globalThis.exported=compute;';
const output=obfuscateFiles([{path:'app.js',sourceType:'script',code:source}],{
  mode:'coo',seed:'classic-private-performance-v1',closedWorld:true,
  strings:false,identifiers:false
}).files[0];
assert.equal(output.metrics.properties,2);

/**
 * @param {string} script
 * @returns {(x:number)=>number}
 */
function compile(script) {
  const context=vm.createContext({});
  vm.runInContext(script,context,{timeout:2000});
  return /** @type {(x:number)=>number} */ (context.exported);
}
const native=compile(source);
const transformed=compile(/** @type {string} */(output.code));

/** @param {(x:number)=>number} fn @returns {number} */
function work(fn) {
  let checksum=0;
  for(let i=0;i<800000;i++)checksum^=fn((i*31)|0);
  return checksum;
}
assert.equal(work(native),work(transformed));
for(let i=0;i<8;i++){work(native);work(transformed);}
const originals=[],candidates=[];
for(let i=0;i<19;i++) {
  /** @param {(x:number)=>number} fn @param {number[]} output */
  function sample(fn,output){
    const started=performance.now();
    const checksum=work(fn);
    assert.ok(Number.isInteger(checksum));
    output.push(performance.now()-started);
  }
  if(i&1){sample(transformed,candidates);sample(native,originals);}
  else{sample(native,originals);sample(transformed,candidates);}
}
/** @param {number[]} data @returns {number} */
function median(data){
  return [...data].sort((a,b)=>a-b)[Math.floor(data.length/2)];
}
const nativeMs=median(originals);
const transformedMs=median(candidates);
console.log(JSON.stringify({
  platform:process.platform,node:process.version,
  originalBytes:Buffer.byteLength(source),
  transformedBytes:Buffer.byteLength(/** @type {string} */ (output.code)),
  properties:output.metrics.properties,iterations:800000,
  nativeMedianMs:nativeMs,transformedMedianMs:transformedMs,
  ratio:transformedMs/nativeMs,withinSelectedBudget:transformedMs/nativeMs<=2.5,
  excludesStartup:true
},null,2));
