'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runEvidence}=require('../sims/reanchor-dense-compatibility-screen');

test('dense 96-source reanchoring samples expose hidden compatible-basis rarity',()=>{
  const report=runEvidence();
  assert.equal(report.sourceTotal,96);
  assert.equal(report.targetTotal,96);
  assert.equal(report.totalExact+report.totalFailures,96);
  assert.equal(report.families.length,3);
  assert.equal(report.positiveControlCompatible,true);
  for(const family of report.families) {
    assert.equal(family.cases,32);
    assert.equal(family.exact+family.failures,32);
    assert.ok(family.attemptedAnchors>=32);
    assert.ok(family.attemptedAnchors<=512);
    assert.equal(family.compatibleAnchors+
      family.incompatibleFullRankAnchors+family.singularAnchors,
      family.attemptedAnchors);
    assert.ok(family.minQueries>=33);
    assert.ok(family.maxQueries<=16*65);
    assert.ok(family.fortuitousSuccesses<=family.exact);
  }
  console.log('REANCHOR_DENSE_COMPATIBILITY '+JSON.stringify(report));
});
