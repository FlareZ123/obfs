'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {linearInput,triangularOutput,oracle,auditAllAnchors,
  nonConvergingTrajectory}=require('../sims/reanchor-incompatible-four-bit-cycle');

test('four-bit compatible P and invertible A each preserve all sixteen values',()=>{
  for(const fn of [linearInput,triangularOutput,oracle]) {
    assert.equal(new Set(Array.from({length:16},(_,x)=>fn(x))).size,16);
  }
});

test('all 16 anchor matrices fail compatible source-basis admission',()=>{
  assert.deepEqual(auditAllAnchors(),{
    fullRank:8,singular:8,compatible:0
  });
});

test('full-rank anchor 11 cycles on exact target F(1)=5',()=>{
  assert.deepEqual(nonConvergingTrajectory(),{
    basis:[3,10,5,4],
    sourceBasis:[15,10,8,12],
    target:5,
    trajectory:[14,6,9,14]
  });
});
