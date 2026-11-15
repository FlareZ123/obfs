'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {searchSynchronizingWordDiversified}=require('../sims/sco-sync-diversified');
const {makeSynchronizingMachine,runDiscoveredDiversified}=require('../sims/sco-synchronizing-oracle');
const {reachableStates,observationallySynchronizes,runComparison}=
  require('../sims/sco-sync-diversified-report');

test('diversified public-only search discovers 000 on 64 seeded four-state machines',async()=>{
  for(let seed=0;seed<64;seed++){
    const model=makeSynchronizingMachine((seed*3317+0x1237ab42)>>>0);
    let state=0,operations=0;
    const api={
      async step(symbol){
        operations++;
        const old=state;
        state=model.next[old][symbol];
        return model.output[old][symbol];
      }
    };
    const discovered=await searchSynchronizingWordDiversified(api);
    assert.deepEqual(discovered.word,[0,0,0],String(seed));
    assert.equal(discovered.steps,operations);
    assert.equal(discovered.inputTape.length,operations);
  }
});

test('physical and observational synchronization are different in opaque machines',()=>{
  const permutation={
    next:Array.from({length:4},(_,state)=>[(state+1)%4,(state+3)%4]),
    output:Array.from({length:4},()=>[0,0])
  };
  assert.deepEqual(reachableStates(permutation,0),[0,1,3,2]);
  assert.equal(new Set(permutation.next.map(row=>row[0])).size,4);
  assert.equal(observationallySynchronizes(permutation,[0],[0,1,2,3]),true);
  const distinguishable={...permutation,output:[[0,0],[1,0],[0,1],[1,1]]};
  assert.equal(observationallySynchronizes(distinguishable,[0],[0,1,2,3]),false);
});

test('diversified attack reduces false post-search observable resets in two independent corpora',async()=>{
  const result=await runComparison(250);
  assert.equal(result.count,250);
  assert.equal(result.corpora.length,2);
  for(const corpus of result.corpora){
    const {original,diversified}=corpus;
    assert.equal(original.proposed,original.continuationObservable+original.falseContinuation);
    assert.equal(diversified.proposed,diversified.continuationObservable+diversified.falseContinuation);
    assert.ok(diversified.falseContinuation<original.falseContinuation);
    assert.ok(diversified.continuationObservable>original.continuationObservable);
    assert.ok(diversified.steps>original.steps);
  }
});

test('real authenticated SCO step-only RPC supports diversified discovery and heldout recovery',async()=>{
  const result=await runDiscoveredDiversified(2);
  assert.equal(result.scenarios,2);
  assert.equal(result.heldout,4092);
  assert.equal(result.allExact,true);
  assert.equal(result.networkSteps,result.discoverySteps+result.rpcSteps);
  assert.ok(result.strictlyUnseen>1000);
  for(const detail of result.details){
    assert.deepEqual(detail.discoveredWord,[0,0,0]);
    assert.equal(detail.discoverySteps,1950);
    assert.equal(detail.publicResetExport,false);
    assert.equal(detail.unauthorizedStatus,403);
    assert.equal(detail.sourceDisclosed,false);
    assert.equal(detail.heldout,2046);
    assert.ok(detail.strictlyUnseen>500);
  }
});
