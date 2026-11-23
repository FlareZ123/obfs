'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runComparison}=require('../sims/sco-two-sided-affine-inverse-comparison');

test('live 529-query SCO and minified ordinary private API: offline inverse of the same hidden quadratic triangular map', {timeout:120000},async()=>{
  const report=await runComparison();
  assert.equal(report.deniedSco,403);
  assert.equal(report.deniedOrdinary,403);
  assert.equal(report.privateSourceLeaked,false);
  assert.equal(report.scoQueries,529);
  assert.equal(report.ordinaryQueries,529);
  assert.equal(report.scoPrivateExecutions,529);
  assert.equal(report.ordinaryPrivateExecutions,529);
  assert.equal(report.modelsEqual,true);
  assert.equal(report.stoppedBeforeInversion,true);
  assert.equal(report.heldoutTargets,16);
  assert.equal(report.matchedTargets,16);
  assert.ok(report.scoOfflineLocalEvaluations>0);
  assert.equal(report.scoOfflineLocalEvaluations,report.ordinaryOfflineLocalEvaluations);
  assert.equal(report.fastScoLocalEvaluations,16);
  assert.equal(report.fastOrdinaryLocalEvaluations,16);
  assert.equal(report.fastScoLinearSystems,report.fastOrdinaryLinearSystems);
  assert.ok(report.scoOfflineLocalEvaluations>report.fastScoLocalEvaluations,
    'Algebraic polar transport must avoid repeated clone evaluations');
  assert.ok(report.publishedBytes<report.originalBytes,
    'Selected private function body must be withheld by SCO facade');
  console.log('SCO_TWO_SIDED_AFFINE_COEFFICIENT_INVERSE '+JSON.stringify(report));
});
