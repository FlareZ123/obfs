'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');

test('FramePosition-preserving string helper is declined for classic scripts',()=>{
  const source='const message="This sufficiently long string literal is not emitted into a global helper.";globalThis.result=message.length;';
  const output=obfuscateFiles([{path:'entry.js',sourceType:'script',code:source}],{
    mode:'coo',closedWorld:true,seed:'agent10-classic-script-string-gate',
    identifiers:false,strings:true,properties:false,
    experimentalPreserveFramePositions:true
  }).files[0];
  assert.equal(output.metrics.literals,0);
  assert.equal(output.code,source);
  assert.doesNotMatch(output.code,/\\nfunction /u);
  const context={};
  vm.runInNewContext('const a=1;',context,{timeout:1000});
  vm.runInNewContext(output.code,context,{timeout:1000});
  assert.equal(context.result,source.match(/message="([^"]+)"/u)?.[1].length);
});
