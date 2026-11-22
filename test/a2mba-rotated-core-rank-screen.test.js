'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {nonlinearResidualRank,runScreen}=require('../sims/a2mba-rotated-core-affine-rank');

test('nonlinear displacement rank detects known rank-one and rank-two shears',()=>{
  const result=runScreen();
  assert.equal(result.controls.rankOne.rank,1);
  assert.equal(result.controls.rankTwo.rank,2);
  assert.equal(result.controls.rankOne.observations,4592);
  assert.equal(result.controls.rankTwo.observations,4592);
});

test('rotated-core public 32-bit projection has full rank but preserves native semantics',()=>{
  const result=runScreen();
  assert.equal(result.baseline.rank,32);
  assert.equal(result.fullBaseline.rank,32);
  assert.deepEqual(result.certificate,{pairs:32,rank:32});
  assert.equal(result.fullBaseline.observations,12224);
  assert.equal(result.degenerateSlice.rank,0);
  assert.deepEqual(result.rotations.map(record=>record.rotation),[1,8,16,31]);
  assert.ok(result.rotations.every(record=>record.rank===32&&record.checked===10000));
  assert.equal(nonlinearResidualRank(x=>x).rank,0);
});
