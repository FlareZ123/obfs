'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runTriangularOrderCensus}=require('../sims/triangular-conjugate-order');

test('all width-four triangular gates have bounded order and conjugate inverses',()=>{
  const data=runTriangularOrderCensus();
  assert.equal(data.maps,32768);
  assert.deepEqual(data.byActive,[1,274,4908,16110,11475]);
  assert.deepEqual(data.byOrder,[1,2063,16112,12544,2048]);
  assert.deepEqual(data.targetOrbits,[32768,131072,196608,131072,32768]);
  assert.deepEqual(data.tightWitnesses,[1,274,3706,6032,2048]);
  assert.equal(data.atMostSevenQueries,30720);
  assert.equal(data.conjugatedTargetChecks,524288);
  console.log('TRIANGULAR_CONJUGATE_ORDER '+JSON.stringify(data));
});
