'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeIndependentMachine,evaluateIndependentMachine,runIndependentSweep}=
  require('../sims/sco-sync-independent-distribution');

test('SHA-256 fixtures are repeatable, bounded and distinct from different seeds',()=>{
  for(const states of [4,8,12,64]){
    const first=makeIndependentMachine(0x31415926,states);
    assert.deepEqual(first,makeIndependentMachine(0x31415926,states));
    assert.notDeepEqual(first,makeIndependentMachine(0x27182818,states));
    assert.equal(first.next.length,states);
    for(let state=0;state<states;state++){
      assert.equal(first.next[state].length,2);
      assert.equal(first.output[state].length,2);
      for(let symbol=0;symbol<2;symbol++){
        assert.ok(first.next[state][symbol]>=0 && first.next[state][symbol]<states);
        assert.ok(first.output[state][symbol]===0||first.output[state][symbol]===1);
      }
    }
  }
  assert.throws(()=>makeIndependentMachine(-1,4),RangeError);
  assert.throws(()=>makeIndependentMachine(1,1),RangeError);
});

test('public attacker step accounting and post-attack classifications are explicit',async()=>{
  const model=makeIndependentMachine(0x31415926,8);
  for(const depth of [3,5]){
    const item=await evaluateIndependentMachine(model,depth);
    assert.ok(item.steps>0);
    assert.deepEqual(item.word,[1]);
    assert.equal(item.steps,depth===3?767:3954);
    assert.equal(item.physical,false);
    assert.equal(item.observable,false);
    assert.equal(item.continuation,true);
  }
});

test('independent base and holdout corpora report candidate and false-positive rates',async()=>{
  for(const holdout of [false,true]){
    const result=await runIndependentSweep(12,holdout);
    assert.equal(result.count,12);
    assert.equal(result.holdout,holdout);
    assert.equal(result.groups.length,12);
    for(const group of result.groups){
      assert.equal(group.count,12);
      assert.equal(group.candidates,group.continuation+group.falseContinuation);
      assert.ok(group.physical<=group.observable);
      assert.ok(group.observable<=group.continuation);
      assert.ok(group.candidates<=group.count);
      assert.ok(group.steps>0);
    }
    assert.deepEqual([...new Set(result.groups.map(group=>group.states))],[4,8,12]);
    assert.deepEqual([...new Set(result.groups.map(group=>group.depth))],[3,5]);
  }
});

test('a held-out twelve-state fixture falsifies depth-five synchronization confidence',async()=>{
  // Base-stream model 48, originally outside the default 40-model sample.
  const model=makeIndependentMachine(0xa82eb665,12);
  const shallow=await evaluateIndependentMachine(model,3);
  const deep=await evaluateIndependentMachine(model,5);
  assert.equal(shallow.word,null);
  assert.equal(shallow.steps,4168);
  assert.deepEqual(deep.word,[0,0,0]);
  assert.equal(deep.steps,7599);
  assert.equal(deep.physical,false);
  assert.equal(deep.observable,false);
  assert.equal(deep.continuation,false);
});
