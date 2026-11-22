'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');

/**
 * Construct two aliases per layer. Every later identifier is bound to both
 * predecessors by visible assignments, producing repeated diamond paths
 * through descriptorBindings and reverse descriptorAliases.
 * @param {number} depth
 * @param {boolean} sensitive
 * @returns {string}
 */
function makeProgram(depth,sensitive=false){
  /** @type {string[]} */
  const lines=['let a0={},b0={};'];
  for(let level=1;level<=depth;level++){
    const prev=level-1;
    lines.push('let a'+level+'=a'+prev+';a'+level+'=b'+prev+';');
    lines.push('let b'+level+'=a'+prev+';b'+level+'=b'+prev+';');
  }
  if(sensitive)
    lines.push('a'+depth+'.ref={get(){return String.prototype;}};');
  lines.push('const box=Object.create(null,a0);');
  lines.push("module.exports=['obfs-alias-dag-sentinel'.charCodeAt(0),Object.keys(box).length];");
  return lines.join('\n');
}

/**
 * Expose one ordinary literal outside a source-spelled failed-call operand.
 * Its positive encoding control makes sensitive-getter refusal nonvacuous.
 * @param {number} depth
 * @param {boolean} sensitive
 * @returns {string}
 */
function exposedLiteralProgram(depth,sensitive=false){
  return makeProgram(depth,sensitive).replace(
    "'obfs-alias-dag-sentinel'.charCodeAt(0)",
    "'obfs-alias-dag-sentinel'");
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
    mode:'sno',seed:'decoder-dag-linear-20261122',
    properties:false,identifiers:false,strings:true,minimumStringLength:2
  }).files[0];
}

test('descriptor alias diamonds retain output and provide compile-time scaling evidence',()=>{
  /** @type {{depth:number,sourceBytes:number,elapsedMs:number,literals:number}[]} */
  const samples=[];
  // One warm graph helps separate module startup from the compiler profile.
  compile(makeProgram(2));
  for(const depth of [4,6,8,10,12]){
    const source=makeProgram(depth);
    const started=performance.now();
    const output=compile(source);
    const elapsedMs=performance.now()-started;
    assert.equal(evaluate(String(output.code)),evaluate(source),'depth '+depth);
    samples.push({depth,sourceBytes:source.length,elapsedMs,literals:output.metrics.literals});
  }
  // Timing data is diagnostic, not a noisy wall-clock CI acceptance gate.
  console.log('ALIAS_DAG_PROFILE '+JSON.stringify(samples));
});

test('plain alias diamonds retain eligible string literal encoding',()=>{
  for(const depth of [2,4,6]){
    const source=exposedLiteralProgram(depth);
    const output=compile(source);
    assert.equal(output.metrics.literals,1,'safe depth '+depth);
    assert.equal(evaluate(String(output.code)),evaluate(source),'safe depth '+depth);
  }
});

test('a descriptor getter write through a deep alias conservatively blocks eager decoding',()=>{
  for(const depth of [2,4,6]){
    const source=exposedLiteralProgram(depth,true);
    const output=compile(source);
    assert.equal(evaluate(String(output.code)),evaluate(source),'depth '+depth);
    assert.equal(output.metrics.literals,0,
      'possible decoder mutation must suppress string rewriting at depth '+depth);
  }
});
