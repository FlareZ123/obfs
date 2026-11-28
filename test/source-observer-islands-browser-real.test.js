'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {main}=require('./source-observer-islands-browser');

test('real Chromium ESM source observer, isolated keys and seedless public normalization',{
  skip:process.platform!=='linux'||process.env.OBFS_FOCUSED_TEST!==
    'test/source-observer-islands-browser-real.test.js',
  timeout:120000
},async()=>{
  const observed=await main();
  assert.equal(observed.browser,'Chromium');
  assert.equal(observed.fields,2);
  assert.equal(observed.matchedGraphs,3);
  assert.equal(observed.normalizedFields,2);
});
