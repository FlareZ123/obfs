'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {compareStatefulMinifier}=require('../sims/stateful-arx-minifier-control');

test('real stateful three-file ESM graph matches pinned ordinary esbuild control',async()=>{
  const receipt=await compareStatefulMinifier(12288);
  assert.equal(receipt.recordCount,12288);
  assert.equal(receipt.matchedEvents,49152);
  assert.equal(receipt.matchedCandidateEvents,49152);
  assert.ok(receipt.codeUnitTransitions>49152);
  assert.equal(receipt.esbuildVersion,'0.28.2');
  console.log('STATEFUL_ARX_NATIVE_MINIFIED_CONTROL '+JSON.stringify(receipt));
});
