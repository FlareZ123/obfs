'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {runChallenge}=require('../sims/sco-triangular-cubic-exact-cegar');

test('authenticated 5489-query cubic clone and offline inversion match equally trusted ordinary HTTP service',async()=>{
  const result=await runChallenge({seed:0x71420000,holdouts:256,targets:16});
  assert.equal(result.scoQueries,5489);
  assert.equal(result.ordinaryQueries,5489);
  assert.equal(result.scoPrivateExecutions,5489);
  assert.equal(result.ordinaryPrivateExecutions,5489);
  assert.equal(result.deniedScoStatus,403);
  assert.equal(result.deniedOrdinaryStatus,403);
  assert.equal(result.transcriptMatched,true);
  assert.ok(result.degreeThreeCoefficients>0);
  assert.equal(result.holdouts,256);
  assert.equal(result.holdoutMatches,256);
  assert.equal(result.targets,16);
  assert.equal(result.exactInversions,16);
  assert.equal(result.offlineContractions,5984);
  assert.equal(result.publicPrivateMarkerLeaked,false);
  assert.equal(result.offlineAfterBothServersClosed,true);
  console.log('SCO_CUBIC_EXACT_CEGAR_MATCHED_CONTROL '+JSON.stringify(result));
});
