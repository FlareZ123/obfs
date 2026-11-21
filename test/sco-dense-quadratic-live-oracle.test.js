'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {randomPrivateQuadratic,runDenseChallenge}=
  require('../sims/sco-dense-quadratic-live-oracle');

test('dense private quadratic source has 529 independently sampled uint32 coefficients',()=>{
  const generated=randomPrivateQuadratic();
  assert.equal(generated.coefficients.length,529);
  for(const coefficient of generated.coefficients){
    assert.ok(Number.isInteger(coefficient)&&coefficient>=0&&coefficient<2**32);
  }
  assert.match(generated.source,/OBFS_PRIVATE_DENSE_COEFFICIENTS/u);
  assert.match(generated.source,/export async function protectedDense/u);
});

test('authenticated SCO dense source: 529 calls recover 529 coefficients offline',{
  timeout:120000
},async()=>{
  const result=await runDenseChallenge();
  assert.equal(result.queries,529);
  assert.equal(result.privateCalls,529);
  assert.equal(result.deniedStatus,403);
  assert.equal(result.protectedIdentifiersServed,false);
  assert.equal(result.recoveredCoefficients,529);
  assert.equal(result.coefficientsExactlyRecovered,true);
  assert.equal(result.nonlinearOutputRank,32);
  assert.equal(result.lastPairAmbiguityAt528Queries,true);
  assert.equal(result.serverOfflineBeforeHoldout,true);
  assert.equal(result.heldOut,1028);
  assert.equal(result.matched,1028);
  assert.ok(result.sourceBytes>result.publicBytes);
  assert.match(result.privateSourceSha256,/^[0-9a-f]{64}$/u);
  assert.match(result.transcriptSha256,/^[0-9a-f]{64}$/u);
  console.log('SCO_DENSE_QUADRATIC_AUTHENTICATED '+JSON.stringify(result));
});


test('independent attacker process clones private dense SCO source from HTTP alone',{
  timeout:120000
},async()=>{
  const result=await runDenseChallenge({processIsolatedClient:true});
  assert.equal(result.processIsolatedClient,true);
  assert.equal(result.queries,529);
  assert.equal(result.privateCalls,529);
  assert.equal(result.deniedStatus,403);
  assert.equal(result.protectedIdentifiersServed,false);
  assert.equal(result.recoveredCoefficients,529);
  assert.equal(result.coefficientsExactlyRecovered,true);
  assert.equal(result.nonlinearOutputRank,32);
  assert.equal(result.lastPairAmbiguityAt528Queries,true);
  assert.equal(result.serverOfflineBeforeHoldout,true);
  assert.equal(result.heldOut,1028);
  assert.equal(result.matched,1028);
  console.log('SCO_DENSE_SEPARATE_PROCESS_ATTACK '+JSON.stringify(result));
});
