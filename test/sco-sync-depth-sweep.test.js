'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runDepthSweep}=require('../sims/sco-sync-depth-sweep');

test('longer public future-observation probes expose their oracle query cost',async()=>{
  const result=await runDepthSweep(100);
  assert.equal(result.count,100);
  assert.equal(result.records.length,18);
  const states=[...new Set(result.records.map(item=>item.states))];
  assert.deepEqual(states,[6,8,12]);
  for(const record of result.records){
    assert.equal(record.candidates,
      record.observableContinuation+record.falseContinuation);
    assert.ok(record.physical<=record.observableContinuation);
    assert.ok(record.steps>0);
    assert.ok(record.candidates<=100);
  }
  for(const stateCount of states)for(const seed of ['0x9ab337e1','0xdeadbeef']){
    const rows=result.records.filter(item=>item.states===stateCount&&item.seedBase===seed);
    assert.deepEqual(rows.map(item=>item.depth),[3,5,7]);
    assert.ok(rows[0].steps<rows[1].steps);
    assert.ok(rows[1].steps<rows[2].steps);
  }
});

test('independently seeded holdout reports bounded SCO depth changes without private-model hints',async()=>{
  const result=await runDepthSweep(100,true);
  assert.equal(result.records.length,18);
  assert.deepEqual([...new Set(result.records.map(record=>record.seedBase))],
    ['0x6ca2de94','0x13579bdf']);
  for(const record of result.records){
    assert.equal(record.candidates,record.observableContinuation+record.falseContinuation);
    assert.ok(record.physical<=record.observableContinuation);
  }
});
