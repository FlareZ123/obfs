'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');
const {compareBrowser,parseFrame}=require('./agent10-frameposition-browser-helper');

test('identifier-only renaming preserves later strict-ESM FramePosition',{
  skip:process.platform!=='linux'?'real Chromium fixture currently targets the Linux runner':false
},async()=>{
  const source='const marker="xy";const value=marker.length;captureHostStack();export {value};';
  const output=obfuscateFiles([{path:'generated.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'agent10-identifier-frameposition',
    identifiers:true,strings:false,properties:false
  }).files[0];
  const payload=await compareBrowser(source,String(output.code),'identifier');
  assert.deepEqual(payload.values,[2,2]);
  assert.equal(output.metrics.bindings,1,'the local marker binding must be renamed');
  assert.equal(payload.stacks.length,2);
  const native=parseFrame(payload.stacks[0],'/native-identifier.mjs');
  const generated=parseFrame(payload.stacks[1],'/generated-identifier.mjs');
  process.stdout.write('AGENT10_IDENTIFIER_FRAMEPOSITION '+JSON.stringify({
    bindings:output.metrics.bindings,native,generated,values:payload.values
  })+'\\n');
  assert.equal(generated.line,native.line);
  assert.equal(generated.column,native.column);
});

test('identifier renamer refuses shorthand expansions that cannot preserve spans',{
  skip:process.platform!=='linux'?'real Chromium fixture currently targets the Linux runner':false
},async()=>{
  const source='const marker=7;const result={marker};captureHostStack();export {result};';
  const output=obfuscateFiles([{path:'generated.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'agent10-identifier-shorthand-refusal',
    identifiers:true,strings:false,properties:false
  }).files[0];
  const payload=await compareBrowser(source,String(output.code),'shorthand');
  assert.deepEqual(payload.values,[{marker:7},{marker:7}]);
  assert.equal(output.metrics.bindings,0);
  const native=parseFrame(payload.stacks[0],'/native-shorthand.mjs');
  const generated=parseFrame(payload.stacks[1],'/generated-shorthand.mjs');
  assert.equal(generated.line,native.line);
  assert.equal(generated.column,native.column);
});

test('identifier renamer refuses tagged-template references before padding tokens',{
  skip:process.platform!=='linux'?'real Chromium fixture currently targets the Linux runner':false
},async()=>{
  const source='const tag=String;const value=tag`x`;captureHostStack();export {value};';
  const output=obfuscateFiles([{path:'generated.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'agent10-identifier-tag-refusal',
    identifiers:true,strings:false,properties:false
  }).files[0];
  const payload=await compareBrowser(source,String(output.code),'tag');
  assert.deepEqual(payload.values,['x','x']);
  assert.equal(output.metrics.bindings,0);
  const native=parseFrame(payload.stacks[0],'/native-tag.mjs');
  const generated=parseFrame(payload.stacks[1],'/generated-tag.mjs');
  assert.equal(generated.line,native.line);
  assert.equal(generated.column,native.column);
});
