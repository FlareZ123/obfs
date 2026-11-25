'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runLiveStepVersionSpace}=require('../sims/sco-step-only-live-rpc');

/** @typedef {'boundedNine'|'expected'} Policy */

/**
 * The oracle's private transition table is known only to the evaluator.
 * Both attacker arms receive a public step(bit) facade backed by an
 * authenticated local HTTP service, with no public reset method.
 *
 * @param {number} seed
 * @param {Policy} policy
 * @param {number} expectedQueries
 */
async function compare(seed,policy,expectedQueries){
  const result=await runLiveStepVersionSpace(2,seed,true,policy);
  assert.equal(result.states,2);
  assert.equal(result.attackerPolicy,policy);
  assert.equal(result.certified,true);
  assert.equal(result.sourceDisclosed,false);
  assert.equal(result.unauthorizedStatus,403);
  assert.equal(result.publicResetExport,false);
  assert.equal(result.distinctSourceFiles,true);
  assert.equal(result.knownContinuationExact,true);
  assert.equal(result.queries,expectedQueries);
  assert.equal(result.networkSteps,result.queries+16);
  assert.equal(result.attackerModelCount,260);
  assert.equal(result.ordinaryControlRan,true);
  assert.equal(result.ordinaryControlExact,true);
  assert.equal(result.ordinaryUnauthorizedStatus,403);
  assert.equal(result.ordinaryControlQueries,result.queries);
  assert.equal(result.ordinaryControlNetworkSteps,result.networkSteps);
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
  assert.ok(result.ordinaryMinifiedBytes<result.ordinarySourceBytes);
  console.log('SCO_TWO_STATE_LIVE_WEIGHTED '+JSON.stringify({
    seed:'0x'+seed.toString(16),policy,queries:result.queries,
    ordinaryQueries:result.ordinaryControlQueries,
    exact:result.knownContinuationExact,
    sameTranscript:result.attackerTranscriptMatched,
    httpRequests:result.scoHttpRequests,rpcRequests:result.scoRpcRequests,
    requestShapeMatched:result.httpRequestShapeMatched,
    rpcResponseTraceMatched:result.rpcResponseTraceMatched,
    sourceDeliveryMetadataMatched:result.sourceDeliveryMetadataMatched,
    denial:result.unauthorizedStatus
  }));
}

test('nine-capped expected-optimal policy reconstructs live SCO and matched ordinary service',async()=>{
  await compare(0x51a9c603,'boundedNine',7);
  await compare(0xa82b11f5,'boundedNine',9);
});

test('globally expected-optimal policy reconstructs live SCO and matched ordinary service',async()=>{
  await compare(0x51a9c603,'expected',6);
  await compare(0xa82b11f5,'expected',10);
});

test('weighted two-state selector declines unsupported state counts and invalid policies',async()=>{
  await assert.rejects(()=>runLiveStepVersionSpace(3,0x31415926,false,'expected'),RangeError);
  await assert.rejects(()=>runLiveStepVersionSpace(2,0x31415926,true,'baseline'),RangeError);
  await assert.rejects(()=>runLiveStepVersionSpace(2,0x31415926,false,
    // @ts-expect-error Deliberately invalid runtime selector.
    'other'),RangeError);
});
