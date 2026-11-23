'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {uniformTriangularOrderLaw}=require('../sims/triangular-random-order-law');
const {runTriangularOrderCensus}=require('../sims/triangular-conjugate-order');

test('uniform random triangular order and target-orbit laws match all four-bit maps',()=>{
  const exhaustive=runTriangularOrderCensus();
  const law=uniformTriangularOrderLaw(4);
  assert.equal(law.orderCdf[4],1);
  for(let i=0;i<=4;i++) {
    assert.equal(Math.round(law.orderProbability[i]*exhaustive.maps),
      exhaustive.byOrder[i]);
    assert.equal(Math.round(law.targetOrbitProbability[i]*exhaustive.maps*16),
      exhaustive.targetOrbits[i]);
  }
  assert.equal(law.meanTargetOrbit,5.0625);
  assert.equal(law.maxOrderProbability,1/16);
});

test('width-32 analytic probabilities are internally consistent and not width-four extrapolations',()=>{
  const law=uniformTriangularOrderLaw(32);
  assert.equal(law.medianTargetExponent,16);
  assert.equal(law.medianOrderExponent,23);
  assert.ok(Math.abs(law.meanTargetOrbit-(1.5**32))<1e-6);
  assert.ok(Math.abs(law.meanTargetOrbit-431439.8832739892)<1e-6);
  assert.ok(Math.abs(law.orderCdf[24]-0.9410283)<0.000001);
  assert.ok(Math.abs(law.orderCdf[22]-0.3297884)<0.000001);
  assert.ok(Math.abs(law.maxOrderProbability-2**-32)<1e-12);
  assert.ok(Math.abs(law.orderProbability.reduce((a,b)=>a+b,0)-1)<1e-12);
  assert.ok(Math.abs(law.targetOrbitProbability.reduce((a,b)=>a+b,0)-1)<1e-12);
  console.log('TRIANGULAR_WIDTH32_LAW '+JSON.stringify({
    medianOrderExponent:law.medianOrderExponent,
    medianTargetExponent:law.medianTargetExponent,
    meanOrder:law.meanOrder,meanTargetOrbit:law.meanTargetOrbit,
    orderCdf22:law.orderCdf[22],orderCdf24:law.orderCdf[24]
  }));
});
