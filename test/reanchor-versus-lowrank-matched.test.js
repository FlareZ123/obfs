'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runEvidence}=require('../sims/reanchor-versus-lowrank-matched');

test('public reanchoring versus independent rank-four deterministic inverter on matched targets',()=>{
  const report=runEvidence();
  assert.equal(report.sourceCount,12);
  assert.equal(report.targetCount,24);
  assert.equal(report.exact,24);
  assert.equal(report.winners.reanchor+report.winners.lowRank+report.winners.tie,24);
  assert.ok(report.queries.reanchor.min>=33);
  assert.ok(report.queries.reanchor.max<=64);
  assert.ok(report.queries.lowRank.min>=33);
  assert.ok(report.queries.lowRank.max<=33+256);
  assert.ok(report.rows.every(x=>x.lowRankNullity<=4));
  console.log('REANCHOR_VS_LOWRANK '+JSON.stringify(report));
});
