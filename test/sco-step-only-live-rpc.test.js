'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runLiveStepVersionSpace}=require('../sims/sco-step-only-live-rpc');

test('real authenticated SCO facade supports a public-only two-state continuation clone',async()=>{
  const result=await runLiveStepVersionSpace(2,0x31415926);
  assert.equal(result.states,2);
  assert.equal(result.certified,true);
  assert.equal(result.sourceDisclosed,false);
  assert.equal(result.unauthorizedStatus,403);
  assert.equal(result.publicResetExport,false);
  assert.equal(result.distinctSourceFiles,true);
  assert.equal(result.knownContinuationExact,true);
  assert.ok(result.queries>0&&result.queries<=128);
  assert.equal(result.networkSteps,result.queries+16);
});

test('real generated SCO facade supports three hidden states with no reset endpoint',async()=>{
  const result=await runLiveStepVersionSpace(3,0xa82b11f5);
  assert.equal(result.states,3);
  assert.equal(result.certified,true);
  assert.equal(result.sourceDisclosed,false);
  assert.equal(result.unauthorizedStatus,403);
  assert.equal(result.publicResetExport,false);
  assert.equal(result.knownContinuationExact,true);
  assert.ok(result.queries>0&&result.queries<=128);
  assert.equal(result.networkSteps,result.queries+16);
});

test('generated four-state SCO and matched ordinary esbuild-minified service yield identical clones',async()=>{
  const result=await runLiveStepVersionSpace(4,0xa82b4c3c,true);
  assert.equal(result.states,4);
  assert.equal(result.certified,true);
  assert.equal(result.sourceDisclosed,false);
  assert.equal(result.unauthorizedStatus,403);
  assert.equal(result.publicResetExport,false);
  assert.equal(result.knownContinuationExact,true);
  assert.ok(result.queries>0&&result.queries<=128);
  assert.equal(result.attackerModelCount,16777216);
  assert.ok(result.attackerScanWork>0);
  assert.ok(result.attackerEquivalenceChecks>=0);
  assert.ok(result.attackerProductPairs>=0);
  assert.ok(result.attackerElapsedMs>0);
  assert.equal(result.ordinaryControlRan,true);
  assert.equal(result.ordinaryControlQueries,result.queries);
  assert.equal(result.ordinaryControlExact,true);
  assert.equal(result.ordinaryUnauthorizedStatus,403);
  assert.ok(result.ordinarySourceBytes>0);
  assert.ok(result.ordinaryMinifiedBytes>0);
  assert.ok(result.ordinaryMinifiedBytes<result.ordinarySourceBytes);
  assert.equal(result.attackerTranscriptMatched,true);
  assert.equal(result.httpRequestCountMatched,true);
  assert.equal(result.httpRequestShapeMatched,true);
  assert.equal(result.rpcResponseTraceMatched,true);
  assert.equal(result.sourceDeliveryMetadataMatched,true);
  assert.equal(result.httpApplicationTraceMatched,true);
  assert.equal(result.scoHttpRequests,result.queries+19);
  assert.equal(result.ordinaryControlHttpRequests,result.scoHttpRequests);
  assert.equal(result.scoRpcRequests,result.queries+18);
  assert.equal(result.ordinaryControlRpcRequests,result.scoRpcRequests);
  assert.ok(result.scoPublishedBytes>0);
  assert.ok(result.ordinaryPublishedBytes>0);
  assert.equal(result.ordinaryPublishedBytes,result.ordinaryMinifiedBytes);
  assert.equal(result.ordinaryControlNetworkSteps,result.ordinaryControlQueries+16);
  assert.equal(result.networkSteps,result.queries+16);
});

test('generated five-state SCO and matched ordinary esbuild-minified service yield identical clones',async()=>{
  const result=await runLiveStepVersionSpace(5,0x42f5a7c9,true);
  assert.equal(result.states,5);
  assert.equal(result.certified,true);
  assert.equal(result.sourceDisclosed,false);
  assert.equal(result.unauthorizedStatus,403);
  assert.equal(result.publicResetExport,false);
  assert.equal(result.knownContinuationExact,true);
  assert.ok(result.queries>0&&result.queries<=128);
  assert.equal(result.attackerModelCount,165888708);
  assert.ok(result.attackerScanWork>0);
  assert.ok(result.attackerEquivalenceChecks>=0);
  assert.ok(result.attackerProductPairs>=0);
  assert.ok(result.attackerElapsedMs>0&&result.attackerElapsedMs<15000);
  assert.equal(result.attackerCandidateBytes,663554832);
  assert.ok(result.attackerWorkspaceInitializationMs>0);
  assert.equal(result.ordinaryControlRan,true);
  assert.equal(result.ordinaryControlQueries,result.queries);
  assert.equal(result.ordinaryControlExact,true);
  assert.equal(result.ordinaryUnauthorizedStatus,403);
  assert.ok(result.ordinarySourceBytes>0);
  assert.ok(result.ordinaryMinifiedBytes>0);
  assert.ok(result.ordinaryMinifiedBytes<result.ordinarySourceBytes);
  assert.equal(result.attackerTranscriptMatched,true);
  assert.equal(result.httpRequestCountMatched,true);
  assert.equal(result.httpRequestShapeMatched,true);
  assert.equal(result.rpcResponseTraceMatched,true);
  assert.equal(result.sourceDeliveryMetadataMatched,true);
  assert.equal(result.httpApplicationTraceMatched,true);
  assert.equal(result.scoHttpRequests,result.queries+19);
  assert.equal(result.ordinaryControlHttpRequests,result.scoHttpRequests);
  assert.equal(result.scoRpcRequests,result.queries+18);
  assert.equal(result.ordinaryControlRpcRequests,result.scoRpcRequests);
  assert.ok(result.scoPublishedBytes>0);
  assert.ok(result.ordinaryPublishedBytes>0);
  assert.equal(result.ordinaryPublishedBytes,result.ordinaryMinifiedBytes);
  assert.equal(result.ordinaryControlNetworkSteps,result.ordinaryControlQueries+16);
  assert.equal(result.networkSteps,result.queries+16);
});

test('invalid private SCO scenario parameters are refused without starting a service',async()=>{
  await assert.rejects(()=>runLiveStepVersionSpace(6),RangeError);
  await assert.rejects(()=>runLiveStepVersionSpace(2,-1),RangeError);
  await assert.rejects(()=>runLiveStepVersionSpace(3,0x1234,true),RangeError);
});
