'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');
const {parse}=require('../src/ast');
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


test('short string literals fit the decoder call and multiline continuations are refused',()=>{
  const shortSource='const text="abcd";const value=text.length;export {value};';
  const shortOutput=obfuscateFiles([{path:'generated.mjs',sourceType:'module',code:shortSource}],{
    mode:'coo',closedWorld:true,seed:'agent10-string-short-span',
    identifiers:false,strings:true,properties:false
  }).files[0];
  assert.equal(shortOutput.metrics.literals,1);
  const helperStart=shortOutput.code.lastIndexOf('\nfunction ');
  assert.equal(helperStart,shortSource.length,'the appended decoder must begin after the unchanged source prefix');
  assert.doesNotThrow(()=>parse(shortOutput.code,'module'));

  const continuedSource='const text="ab'+String.fromCharCode(92)+'\ncd";const value=text.length;export {value};';
  const continuedOutput=obfuscateFiles([{path:'generated.mjs',sourceType:'module',code:continuedSource}],{
    mode:'coo',closedWorld:true,seed:'agent10-string-line-continuation',
    identifiers:false,strings:true,properties:false
  }).files[0];
  assert.equal(continuedOutput.metrics.literals,0);
  assert.equal(continuedOutput.code,continuedSource,
    'a line-continuation literal must remain untouched to preserve line coordinates');
  assert.doesNotThrow(()=>parse(continuedOutput.code,'module'));
});
