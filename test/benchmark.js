'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const {performance} = require('node:perf_hooks');
const {obfuscateFiles} = require('../src');

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @param {string} code @returns {(n:number)=>number} */
function compile(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:3000});
  return context.module.exports;
}

/** @param {string} label @param {string} code @returns {void} */
function bench(label,code) {
  const output=obfuscateFiles([{path:'workload.cjs',code}],{mode:'sno',seed:'bench'}).files[0];
  const original=compile(code);
  const modified=compile(output.code);
  for(let i=0;i<15;i++) {
    assert.equal(original(25000),modified(25000));
  }
  const baseline=[];
  const transformed=[];
  for(let i=0;i<9;i++) {
    const start=performance.now();
    original(1000000);
    baseline.push(performance.now()-start);
    const after=performance.now();
    modified(1000000);
    transformed.push(performance.now()-after);
  }
  const left=median(baseline),right=median(transformed),ratio=right/left;
  process.stdout.write(`${label}: baseline ${left.toFixed(2)}ms; obfuscated ${right.toFixed(2)}ms; ratio ${ratio.toFixed(3)}x\n`);
  if(ratio>2.5)process.exitCode=1;
}

bench('numeric arithmetic',`function run(n){let x=0;for(let i=0;i<n;i++)x+=(i*7)%13;return x;}module.exports=run;`);
bench('hot object property',`const state={counter:0};function run(n){let x=0;for(let i=0;i<n;i++){x+=i&3;state.counter=x;}return state.counter;}module.exports=run;`);
bench('hot string comparison',`const state={label:'label-long-constant'};function run(n){let x=0;for(let i=0;i<n;i++){if(state.label==='label-long-constant')x++;}return x;}module.exports=run;`);
