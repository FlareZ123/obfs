'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');
const {compareBrowser,parseFrame}=require('./agent10-frameposition-browser-helper');

test('identifier-only renaming preserves later strict-ESM FramePosition',{
  skip:process.platform!=='linux'?'real Chromium fixture currently targets the Linux runner':false
},async()=>{
  const source='const operand=20;const value=operand;captureHostStack();export {value};';
  const output=obfuscateFiles([{path:'generated.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'agent10-identifier-frameposition',
    identifiers:true,strings:false,properties:false
  }).files[0];
  const payload=await compareBrowser(source,String(output.code),'identifier');
  assert.deepEqual(payload.values,[20,20]);
  assert.equal(output.metrics.bindings,1,'the local operand binding must be renamed');
  assert.equal(payload.stacks.length,2);
  const native=parseFrame(payload.stacks[0],'/native-identifier.mjs');
  const generated=parseFrame(payload.stacks[1],'/generated-identifier.mjs');
  process.stdout.write('AGENT10_IDENTIFIER_FRAMEPOSITION '+JSON.stringify({
    bindings:output.metrics.bindings,native,generated,values:payload.values
  })+'\n');
  assert.equal(generated.line,native.line);
  assert.equal(generated.column,native.column);
});
