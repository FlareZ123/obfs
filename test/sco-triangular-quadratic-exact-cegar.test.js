'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {runTrial,runSuite}=require('../sims/exact-quadratic-compatible-cegar');
const {runChallenge}=require('../sims/sco-triangular-quadratic-exact-cegar');

test('exact quadratic CEGAR recovers compatible targets from a 529-query clone',()=>{
  for(const seed of [0x71000000,0x71010203,0x71020406,0x71030609]){
    const row=runTrial(seed,{holdouts:1028,targets:8});
    assert.equal(row.oracleQueries,529);
    assert.equal(row.cloneMismatches,0);
    assert.equal(row.inversions,row.targets);
    assert.ok(row.radicalCodimension>16);
    assert.equal(row.offlineDefectEvaluations,16896);
  }
});

test('reduced deterministic reproduction suite remains stable',()=>{
  const result=runSuite({trials:4,holdouts:256,targets:4,seed:0x71000000});
  assert.equal(result.instances,4);
  assert.equal(result.oracleQueriesPerInstance.length,1);
  assert.equal(result.oracleQueriesPerInstance[0],529);
  assert.equal(result.cloneMismatches,0);
  assert.equal(result.exactInversions,16);
});

test('live SCO and matched ordinary RPC controls clone and invert identically',async()=>{
  const result=await runChallenge({seed:0x71000000,holdouts:1028,targets:20});
  assert.equal(result.scoQueries,529);
  assert.equal(result.ordinaryQueries,529);
  assert.equal(result.scoPrivateExecutions,529);
  assert.equal(result.ordinaryPrivateExecutions,529);
  assert.equal(result.deniedScoStatus,403);
  assert.equal(result.deniedOrdinaryStatus,403);
  assert.equal(result.transcriptMatched,true);
  assert.equal(result.holdoutMatches,1028);
  assert.equal(result.exactInversions,20);
  assert.equal(result.offlineAfterBothServersClosed,true);
  assert.ok(result.radicalCodimension>16);
});
