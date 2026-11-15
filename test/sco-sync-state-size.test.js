'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeGeneralMachine}=require('../sims/sco-sync-search-falsification');
const {makeVariableMachine,observableReset,terminals,runSizeSweep}=
  require('../sims/sco-sync-state-size');
const {observableStateClasses}=require('../sims/sco-mealy-refinement');

test('variable-state fixture preserves the original four-state generator exactly',()=>{
  for(let seed=0;seed<32;seed++){
    const initial=(0x9ab337e1+Math.imul(seed,7919))>>>0;
    assert.deepEqual(makeVariableMachine(initial,4),makeGeneralMachine(initial));
  }
});

test('partition-refined observable state agrees with explicit same-state convergence',()=>{
  const model={next:[[0,0],[1,1],[2,2]],output:[[0,0],[0,0],[1,0]]};
  const classes=observableStateClasses(model);
  assert.equal(observableReset(model,[],[0,1],classes),true);
  assert.equal(observableReset(model,[],[0,2],classes),false);
  assert.deepEqual(terminals(model,[0,1],[0,1,2]),[0,1,2]);
});

test('fixed public step attack reports honest 4-12-state empirical coverage and false candidates',async()=>{
  const result=await runSizeSweep(250);
  assert.equal(result.count,250);
  assert.deepEqual(result.groups.map(group=>group.states),[4,4,6,6,8,8,12,12]);
  assert.deepEqual([...new Set(result.groups.map(group=>group.seedBase))],
    ['0x9ab337e1','0xdeadbeef']);
  for(const group of result.groups){
    assert.equal(group.candidates,group.continuationObservable+group.falseContinuation);
    assert.ok(group.physical<=group.globalObservable);
    assert.ok(group.globalObservable<=group.initialObservable);
    assert.ok(group.initialObservable<=group.continuationObservable);
    assert.ok(group.candidates<=250);
    assert.ok(group.steps>0);
  }
});
