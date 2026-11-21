'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {run}=require('../sims/public-residual-extremal-affine-wrapper');

test('dense output affine wrappers preserve extremal interpolant and exact inversions',()=>{
  const result=run();
  assert.equal(result.seed,'0x8a771e55');
  assert.equal(result.instances,6);
  assert.equal(result.targets,1386);
  assert.equal(result.rankRepairs,8);
  assert.equal(result.maxExpansions,0);
  assert.ok(result.maxQueries<=528);
  assert.deepEqual(result.byWidth,{
    '6':64,'8':256,'10':1024,'12':32,'14':8,'16':2
  });
});
