'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {main}=require('../sims/application-challenge-refusal-yield');

test('paired six-module null-prototype application restores 2/2 keys and confirms public-only offline cloning',async()=>{
  // The simulator independently compares every variant with its own exact
  // native source. Its own assertions enforce 0/2 on the frozen original,
  // 2/2 on the deliberately modified null-prototype owner, native/generated
  // differential output, and 160 held-out public-only clones per variant.
  const report=await main();
  assert.equal(report.rows.length,4);
  assert.equal(report.sampleCount,84);
});
