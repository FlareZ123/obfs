'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {main}=require('./esm-observation-browser');

test('real Chromium preserves a default JavaScript object versus a text import of its source',async t=>{
  if(process.platform==='win32') {
    t.skip('The manual focused runner only provisions Chromium on Ubuntu');
    return;
  }
  const report=await main();
  assert.equal(report.nativeBrowserParity,true);
  assert.equal(report.cases,9);
});
