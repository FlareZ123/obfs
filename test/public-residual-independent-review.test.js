'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {verifyPermutation,runIndependentReview}=require('../sims/public-residual-independent-review');

test('peer verifier rejects nonpermutations before inference',()=>{
  assert.throws(()=>verifyPermutation([0,0,1,2]),/permutation/);
});

test('independent exhaustive 3-bit and seeded 4-bit singular-repair review',()=>{
  const report=runIndependentReview(30000);
  assert.equal(report.width3.permutations,40320);
  assert.equal(report.width3.targets,322560);
  assert.equal(report.width4.permutations,30000);
  assert.equal(report.width4.targets,480000);
  assert.ok(report.width4.withGrowth>0,'sample must exercise closure growth');
  assert.ok(report.width4.withRepair>0,'sample must exercise rank repair');
  assert.ok(report.width4.example!==null);
  process.stdout.write('Peer residual inverter reproducibility: '+JSON.stringify(report)+'\n');
});
