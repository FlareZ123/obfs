'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeSynchronizingMachine,recoverWithoutReset,runSynchronizing}
  =require('../sims/sco-synchronizing-oracle');
const {privateTrace,learnedTrace}=require('../sims/sco-stateful-oracle');

test('three zero symbols synchronize all four private states',()=>{
  for(let index=0;index<16;index++) {
    const model=makeSynchronizingMachine(index+31337);
    for(let state=0;state<4;state++) {
      let current=state;
      for(let operation=0;operation<3;operation++)current=model.next[current][0];
      assert.equal(current,0);
    }
  }
});

test('attacker learns stateful behavior from step alone using known synchronizing word',async()=>{
  for(let index=0;index<8;index++) {
    const model=makeSynchronizingMachine(index+744);
    let current=0,operations=0;
    const api={
      async step(symbol){
        operations++;
        const previous=current;
        current=model.next[previous][symbol];
        return model.output[previous][symbol];
      }
    };
    const learned=await recoverWithoutReset(api);
    assert.equal(learned.machine.access.length,4);
    assert.equal(learned.rpcSteps,operations);
    assert.equal(learned.rpcSteps,learned.logicalRequests+2*learned.resetCalls);
    for(let bits=1;bits<1024;bits++) {
      const word=bits.toString(2).split('').map(Number);
      assert.deepEqual(learnedTrace(learned.machine,word),privateTrace(model,word));
    }
  }
});

test('invalid supposed synchronizing symbols are rejected before any network call',async()=>{
  let operations=0;
  const api={async step(){operations++;return 0;}};
  await assert.rejects(()=>recoverWithoutReset(api,[1]),/synchronizing word/);
  await assert.rejects(()=>recoverWithoutReset(api,[]),/synchronizing word/);
  assert.equal(operations,0);
});

test('real SCO step-only proxy permits learning without a reset endpoint',async()=>{
  const result=await runSynchronizing(2);
  assert.equal(result.scenarios,2);
  assert.equal(result.heldout,4092);
  assert.equal(result.allExact,true);
  assert.ok(result.rpcSteps>=1200&&result.rpcSteps<=5000);
  for(const detail of result.details) {
    assert.equal(detail.states,4);
    assert.equal(detail.publicResetExport,false);
    assert.equal(detail.unauthorizedStatus,403);
    assert.equal(detail.heldout,2046);
    assert.equal(detail.rpcSteps,detail.logicalRequests+2*detail.resetCalls);
  }
});
