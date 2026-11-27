'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runEvidence}=require('../sims/reanchor-dense-hybrid-portfolio-screen');

test('bounded hybrid fallback evaluated on exactly 96 independently seeded dense sources',()=>{
  const r=runEvidence();
  assert.equal(r.total,96);
  assert.equal(r.families.length,3);
  assert.equal(r.exact+r.failed,96);
  assert.equal(r.counts.reanchor+r.counts.cegar8+r.counts.cegar128,r.exact);
  for(const row of r.families) {
    assert.equal(row.cases,32);
    assert.equal(row.exact+row.failures,32);
    assert.ok(row.minQueries>=33);
    assert.ok(row.maxQueries>=row.minQueries);
    assert.equal(row.counts.reanchor+row.counts.cegar8+row.counts.cegar128,
      row.exact);
  }
  assert.ok(r.exact>=24,
    'The already validated first eight targets in each family must remain exact');
  console.log('REANCHOR_DENSE_HYBRID '+JSON.stringify(r));
});
