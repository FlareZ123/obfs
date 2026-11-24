'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {main}=require('../sims/source-observer-late-decoder-prototype');

test('late hoisted decoder preserves the observed reader FramePosition',async()=>{
  const result=await main();
  assert.equal(result.nativeSourceText,result.emittedSourceText);
  assert.equal(result.nativeCallsite,result.emittedCallsite);
  assert.equal(result.helperAtEnd,true);
  assert.equal(result.sourceReaderOffset,result.emittedReaderOffset);
  assert.equal(result.labelsEqual,true);
  assert.equal(result.valuesEqual,true);
});
