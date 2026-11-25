'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');
const {compareBrowser,parseFrame}=require('./agent10-frameposition-browser-helper');

test('string-only encoding preserves later strict-ESM FramePosition in Chromium',{
  skip:process.platform!=='linux'?'real Chromium fixture currently targets the Linux runner':false
},async()=>{
  const source='const message="This sufficiently long string literal tests whether encoding preserves source positions.";const value=message.length;captureHostStack();export {value};';
  const expectedValue=source.match(/message="([^"]+)"/u)?.[1].length;
  const output=obfuscateFiles([{path:'generated.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'agent10-string-frameposition',
    identifiers:false,strings:true,properties:false
  }).files[0];
  const payload=await compareBrowser(source,String(output.code),'string');
  assert.deepEqual(payload.values,[expectedValue,expectedValue]);
  assert.ok(output.metrics.literals>0,'the long string literal must be transformed');
  assert.equal(payload.stacks.length,2);
  const native=parseFrame(payload.stacks[0],'/native-string.mjs');
  const generated=parseFrame(payload.stacks[1],'/generated-string.mjs');
  process.stdout.write('AGENT10_STRING_FRAMEPOSITION '+JSON.stringify({
    literals:output.metrics.literals,native,generated,values:payload.values
  })+'\n');
  assert.equal(generated.column,native.column,
    'the padded literal edit must preserve the later module frame column');
});
