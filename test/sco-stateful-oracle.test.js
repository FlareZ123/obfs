'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {makeMachine,privateTrace,learnMachine,learnedTrace,runStateful} = require('../sims/sco-stateful-oracle');

test('resettable finite-state learner does not consult the hidden transition table', async () => {
  const machine=makeMachine(0x159a31d2);
  let state=0;
  const api={
    async reset(){state=0;return true;},
    async step(symbol){
      const output=machine.output[state][symbol];
      state=machine.next[state][symbol];
      return output;
    }
  };
  const recovered=await learnMachine(api);
  assert.equal(recovered.machine.access.length,4);
  assert.equal(recovered.experiments,14);
  assert.ok(recovered.requests<900);
  for(let index=1;index<1024;index++) {
    const word=index.toString(2).split('').map(Number);
    assert.deepEqual(learnedTrace(recovered.machine,word),privateTrace(machine,word));
  }
});

test('actual SCO proxy permits legitimate learning of private state transitions', async () => {
  const result=await runStateful(2);
  assert.equal(result.scenarios,2);
  assert.ok(result.requests<2000);
  assert.equal(result.heldout,4092);
  assert.equal(result.allExact,true);
  for(const detail of result.details) {
    assert.equal(detail.unauthorizedStatus,403);
    assert.equal(detail.sourceDisclosed,false);
    assert.equal(detail.learnedStates,4);
    assert.equal(detail.heldout,2046);
  }
});
