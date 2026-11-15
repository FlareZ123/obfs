'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {obfuscateFiles} = require('../src');

/**
 * Run source and transformed CommonJS in independent but equivalently named
 * contexts so V8's observable stack frame coordinates can be compared.
 * @param {string} code
 * @returns {string}
 */
function execute(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{filename:'stack-observer.cjs',timeout:1000});
  return JSON.stringify(context.module.exports);
}

/**
 * A detected stack observer forbids syntactic transformations, including the
 * otherwise default SNO eager string decoder and private-property rename.
 * @param {string} source
 */
function compareStack(source) {
  const output=obfuscateFiles([{path:'stack-observer.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'agent50-error-stack-observer'
  }).files[0];
  assert.equal(execute(output.code),execute(source),output.code);
  assert.equal(output.code,source);
  assert.deepEqual(output.metrics,{literals:0,objects:0,properties:0,bindings:0});
}

test('Error.stack preserves exact source coordinates after local bindings',()=>{
  const source=String.raw'use strict';function inspect(){const significantLocal=37;return [significantLocal,new Error('trace').stack.match(/stack-observer.cjs:d+:d+/)[0]];}module.exports=inspect();`;
  compareStack(source);
});

test('Error.captureStackTrace preserves coordinates and source layout',()=>{
  const source=String.raw`'use strict';function capture(){const significantLocal=37;const target={};Error.captureStackTrace(target);return [significantLocal,target.stack.match(/stack-observer\.cjs:\d+:\d+/)[0]];}module.exports=capture();`;
  compareStack(source);
});

test('private property renaming declines when stack frame coordinates are visible',()=>{
  const source=String.raw`'use strict';const owner={hiddenDetail:73};module.exports=[owner.hiddenDetail,new Error('trace').stack.match(/stack-observer\.cjs:\d+:\d+/)[0]];`;
  compareStack(source);
});

test('a separate file stack observer protects source coordinates throughout a file group',()=>{
  const source=String.raw`export function compute(){const significantLocal=2;return significantLocal;}`;
  const observer=String.raw`export const recordedFrame=new Error('trace').stack;`;
  const output=obfuscateFiles([
    {path:'compute.mjs',sourceType:'module',code:source},
    {path:'observer.mjs',sourceType:'module',code:observer}
  ],{mode:'coo',seed:'agent50-cross-file-stacks'});
  assert.equal(output.files[0].code,source);
  assert.equal(output.files[1].code,observer);
  assert.equal(output.files[0].metrics.bindings,0);
});

test('code without stack observation remains eligible for identifier mangling',()=>{
  const source=String.raw`'use strict';function inspect(){const significantLocal=37;return significantLocal;}module.exports=inspect();`;
  const result=obfuscateFiles([{path:'stack-observer.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',strings:false,seed:'agent50-no-stack-control'
  }).files[0];
  assert.equal(execute(result.code),execute(source));
  assert.ok(result.metrics.bindings>0,result.code);
});
