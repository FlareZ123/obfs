'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');
const {compareBrowser}=require('./agent10-frameposition-browser-helper');

test('string-only transform preserves the literal value in strict ESM Chromium',{
  skip:process.platform!=='linux'?'real Chromium fixture currently targets the Linux runner':false
},async()=>{
  const source='const message="This sufficiently long string literal tests whether encoding preserves source positions.";const value=message.length;captureHostStack();export {value};';
  const expectedValue=source.match(/message="([^"]+)"/u)?.[1].length;
  const output=obfuscateFiles([{path:'generated.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'agent10-string-frameposition',
    identifiers:false,strings:true,properties:false
  }).files[0];
  const payload=await compareBrowser(source,String(output.code),'string-smoke');
  assert.deepEqual(payload.values,[expectedValue,expectedValue]);
  assert.ok(output.metrics.literals>0,'the long string literal must be transformed');
  assert.equal(payload.stacks.length,2);
});
