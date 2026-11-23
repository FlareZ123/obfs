'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {buildSample}=require('../examples/symbol-keys/build-sample.cjs');

test('regenerate deterministic Symbol sample from source-stable wrapper',async()=>{
  await buildSample(false);
  const generated=await fs.readFile(path.join(__dirname,'../examples/symbol-keys/after.cjs'),'utf8');
  assert.ok(generated.length>0);
  process.stdout.write('SYMBOL_SAMPLE_BASE64 '+Buffer.from(generated,'utf8').toString('base64')+'\n');
});
