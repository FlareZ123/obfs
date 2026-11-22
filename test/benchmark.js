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

/** @param {string} label @param {string} code @param {number} [minProperties] @returns {void} */
function bench(label,code,minProperties=0) {
  const output=obfuscateFiles([{path:'workload.cjs',code}],{mode:'sno',seed:'bench'}).files[0];
  assert.ok(output.metrics.properties>=minProperties,`${label} did not transform the required properties`);
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
  process.stdout.write(`${label}: baseline ${left.toFixed(2)}ms; obfuscated ${right.toFixed(2)}ms; ratio ${ratio.toFixed(3)}x; properties ${output.metrics.properties}; bindings ${output.metrics.bindings}; strings ${output.metrics.literals}\n`);
  if(ratio>2.5)process.exitCode=1;
}

bench('numeric arithmetic',`function run(n){let x=0;for(let i=0;i<n;i++)x+=(i*7)%13;return x;}module.exports=run;`);
// Exported run() source is public; keep private property operations in a direct-call-only helper.
bench('hot object property',`const state={counter:0};function increment(){state.counter++;return state.counter;}function run(n){let value=0;for(let i=0;i<n;i++)value=increment();return value;}module.exports=run;`,1);
bench('hot string comparison',`const state={label:'label-long-constant'};function matches(){return state.label==='label-long-constant';}function run(n){let x=0;for(let i=0;i<n;i++){if(matches())x++;}return x;}module.exports=run;`,1);
bench('interprocedural local reader',`const state={secretField:7,otherField:5};
const read=value=>value.secretField;
const readOther=()=>state.otherField;
function run(n){let x=0;for(let i=0;i<n;i++)x+=read(state)+readOther();return x;}
module.exports=run;`,2);
bench('forwarded object-pattern read',`const state={secretField:7,otherField:5};
const identity=value=>value;
function readState(){const {secretField:read}=identity(state);return read+state.otherField;}
function run(n){let sum=0;for(let i=0;i<n;i++)sum+=readState();return sum;}
module.exports=run;`,2);

bench('forwarded immediate member read',`const state={secretField:7};const identity=value=>value;
function readState(){return identity(state).secretField;}
function run(n){let sum=0;for(let i=0;i<n;i++)sum+=readState();return sum;}
module.exports=run;`,1);

bench('single-use function factory',`function make(){return {secretField:7,otherField:5};}
const state=make();
function readState(){return state.secretField+state.otherField;}
function run(n){let sum=0;for(let i=0;i<n;i++)sum+=readState();return sum;}
module.exports=run;`,2);
bench('single-use arrow factory',`const make=()=>({secretField:7,otherField:5});
const state=make();
function readState(){return state.secretField+state.otherField;}
function run(n){let sum=0;for(let i=0;i<n;i++)sum+=readState();return sum;}
module.exports=run;`,2);

bench('single-slot private-array owner access',`const state={secretField:7,otherField:5};
const holder=[state];const alias=holder[0];
function readState(){return alias.secretField+state.otherField;}
function run(n){let sum=0;for(let i=0;i<n;i++)sum+=readState();return sum;}
module.exports=run;`,2);

bench('fixed-slot private-tuple owner access',`const state={secretField:7,otherField:5};
const holder=[false,"private-metadata",state,0];const alias=holder[2];
function readState(){return alias.secretField+state.otherField;}
function run(n){let sum=0;for(let i=0;i<n;i++)sum+=readState();return sum;}
module.exports=run;`,2);

bench('fixed-field private-record owner access',`const state={secretField:7,otherField:5};
const holder={tag:"private-metadata",owned:state,nonce:0};const alias=holder.owned;
function readState(){return alias.secretField+state.otherField;}
function run(n){let sum=0;for(let i=0;i<n;i++)sum+=readState();return sum;}
module.exports=run;`,2);
