'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');

/**
 * Each identifier's binding sources include both previous-level aliases.
 * The two roots represent an unbound and a one-argument-bound Object.create.
 * Every runtime assignment ends at the second root, so the native call's
 * descriptor argument is at index 0. The compile-time maximum must be 1.
 * @param {number} depth
 * @returns {string}
 */
function makeBoundDiamond(depth){
  /** @type {string[]} */
  const lines=[
    'let a0=Object.create,b0=Object.create.bind(null,null);'
  ];
  for(let level=1;level<=depth;level++){
    const prev=level-1;
    lines.push('let a'+level+'=a'+prev+';a'+level+'=b'+prev+';');
    lines.push('let b'+level+'=a'+prev+';b'+level+'=b'+prev+';');
  }
  lines.push('const box=a'+depth+'({ref:{value:17}});');
  lines.push("module.exports=[box.ref,'obfs-bound-count-sentinel'];");
  return lines.join('\n');
}

/** @param {string} source @returns {string} */
function evaluate(source){
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:5000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} source @returns {ReturnType<typeof obfuscateFiles>['files'][number]} */
function compile(source){
  return obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'object-create-bound-diamond-v1',
    identifiers:false,properties:false,strings:true
  }).files[0];
}

test('first-class bound Object.create aliases retain native parity and profile compile time',()=>{
  const samples=[];
  compile(makeBoundDiamond(2));
  for(const depth of [4,6,8,10,12]){
    const source=makeBoundDiamond(depth);
    const started=performance.now();
    const emitted=compile(source);
    const elapsedMs=performance.now()-started;
    assert.equal(evaluate(String(emitted.code)),evaluate(source),
      'bound alias diamond depth '+depth);
    samples.push({depth,sourceBytes:source.length,elapsedMs,
      literals:emitted.metrics.literals});
  }
  console.log('BOUND_OBJECT_CREATE_DAG_PROFILE '+JSON.stringify(samples));
});
