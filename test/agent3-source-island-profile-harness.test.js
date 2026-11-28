'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {profile}=require('../sims/source-island-session-profile');

test('source-island profile times the same actually executed ESM leaf outside its restricted graph',async()=>{
  const measured=await profile(25000,3);
  assert.equal(measured.iterations,25000);
  assert.equal(measured.pairs,3);
  assert.ok(measured.renamedProperties>=1,
    'a no-yield result would not meaningfully profile the protected candidate');
  for(const key of /** @type {const} */ ([
    'medianNativeWorkMs','medianEmittedWorkMs','medianNativeWallMs',
    'medianEmittedWallMs','medianWorkRatio','medianWallRatio'
  ])) {
    assert.ok(Number.isFinite(measured[key]) && measured[key]>0,key);
  }
  assert.ok(measured.originalBytes>0 && measured.emittedBytes>0);
  assert.ok(measured.overBudgetWorkPairs>=0 && measured.overBudgetWorkPairs<=3);
  assert.ok(measured.overBudgetWallPairs>=0 && measured.overBudgetWallPairs<=3);
});
