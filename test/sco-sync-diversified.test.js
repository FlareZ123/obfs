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

test('unreachable private states make global physical synchronization undecidable by a public step-only observer',async()=>{
  const outputs=Array.from({length:4},()=>[0,0]);
  const globallySynchronizing={
    next:Array.from({length:4},()=>[0,0]),
    output:outputs
  };
  const neverGloballySynchronizing={
    next:[[0,0],[2,2],[3,3],[1,1]],
    output:outputs
  };
  assert.equal(new Set(globallySynchronizing.next.map(row=>row[0])).size,1);
  assert.equal(new Set(neverGloballySynchronizing.next.map(row=>row[0])).size,4);
  const run=async model=>{
    let state=0;
    return searchSynchronizingWordDiversified({
      async step(symbol){
        const prior=state;
        state=model.next[prior][symbol];
        return model.output[prior][symbol];
      }
    });
  };
  const first=await run(globallySynchronizing);
  const second=await run(neverGloballySynchronizing);
  assert.deepEqual(second.inputTape,first.inputTape);
  assert.deepEqual(second.word,first.word);
  assert.ok(first.word);
  assert.equal(observationallySynchronizes(globallySynchronizing,first.word,[0,1,2,3]),true);
  assert.equal(observationallySynchronizes(neverGloballySynchronizing,first.word,[0,1,2,3]),true);
});

test('heldout physical model retains an explicit distinguishable proposed-word counterexample',()=>{
  // Model 89 of the independent 0x13579bdf / 4567-seed holdout.
  const model={
    next:[[1,3],[0,1],[1,0],[2,3]],
    output:[[0,0],[0,0],[1,0],[0,0]]
  };
  const proposed=[1,0,0];
  const postDiscoveryReachable=reachableStates(model,1);
  assert.deepEqual(postDiscoveryReachable,[1,0,3,2]);
  assert.equal(observationallySynchronizes(model,proposed,postDiscoveryReachable),false);
  const destination=postDiscoveryReachable.map(state=>
    proposed.reduce((previous,input)=>model.next[previous][input],state));
  assert.deepEqual(destination,[1,1,1,0]);
  // Input 100 emits 000 from state 1 and 001 from state 0.
  const suffix=[1,0,0];
  function trace(start){
    let state=start;
    const outputs=[];
    for(const symbol of suffix){
      outputs.push(model.output[state][symbol]);
      state=model.next[state][symbol];
    }
    return outputs;
  }
  assert.deepEqual(trace(1),[0,0,0]);
  assert.deepEqual(trace(0),[0,0,1]);
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

test('independent heldout machine corpora preserve explicit false-candidate accounting',async()=>{
  const result=await runComparison(250,true);
  assert.equal(result.count,250);
  assert.deepEqual(result.corpora.map(corpus=>corpus.seedBase),['0xdeadbeef','0x13579bdf']);
  for(const corpus of result.corpora){
    assert.equal(corpus.original.proposed,corpus.original.continuationObservable+corpus.original.falseContinuation);
    assert.equal(corpus.diversified.proposed,corpus.diversified.continuationObservable+corpus.diversified.falseContinuation);
    assert.ok(corpus.diversified.falseContinuation<corpus.original.falseContinuation);
    assert.ok(corpus.diversified.continuationObservable>corpus.original.continuationObservable);
    assert.ok(corpus.diversified.steps>corpus.original.steps);
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
    assert.equal(detail.discoverySteps,1656);
    assert.equal(detail.publicResetExport,false);
    assert.equal(detail.unauthorizedStatus,403);
    assert.equal(detail.sourceDisclosed,false);
    assert.equal(detail.heldout,2046);
    assert.ok(detail.strictlyUnseen>500);
  }
});
