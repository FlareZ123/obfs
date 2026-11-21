'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runChallenge}=require('../sims/sco-quadratic-529-live-clone');

test('529 authenticated SCO calls permit complete offline quadratic clone',{
  timeout:120000
},async()=>{
  const result=await runChallenge();
  assert.equal(result.queries,529);
  assert.equal(result.privateExecutions,529);
  assert.equal(result.deniedStatus,403);
  assert.equal(result.heldout,1028);
  assert.equal(result.matched,result.heldout);
  assert.equal(result.privateIdentifiersPublished,false);
  assert.equal(result.offlineAfterServerClose,true);
  assert.equal(result.cubicNegativeAtSeven,true);
  assert.ok(result.nonzeroQuadraticCoefficients>0);
  assert.equal(result.nonlinearOutputRank,32);
  assert.match(result.sourceSha256,/^[0-9a-f]{64}$/u);
  assert.match(result.transcriptSha256,/^[0-9a-f]{64}$/u);
  assert.ok(result.originalBytes>0&&result.publishedBytes>0);
  console.log('SCO_QUADRATIC_529_LIVE_CLONE '+JSON.stringify(result));
});
