'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runFixtures}=require('../workplace/sco-five-state-block-packed-benchmark');

test('block-packed 32-candidate representation preserves the five-state learner',async()=>{
  const result=await runFixtures(32);
  assert.equal(result.models,165888708);
  assert.equal(result.candidateBytes,186624800);
  assert.equal(result.heldoutSequences,384);
  assert.deepEqual(result.records.map(record=>record.queries),[31,49,31]);
  assert.deepEqual(result.records.map(record=>record.remaining),[1,4,3646]);
  assert.deepEqual(result.records.map(record=>record.scanWork),[
    655928183,722453014,686821210
  ]);
  for(const record of result.records)assert.ok(record.learnerMs>0&&record.learnerMs<15000);
});

test('block-packed 8192-candidate representation preserves the five-state learner',async()=>{
  const result=await runFixtures(8192);
  assert.equal(result.models,165888708);
  assert.equal(result.candidateBytes,331858420);
  assert.equal(result.heldoutSequences,384);
  assert.deepEqual(result.records.map(record=>record.queries),[31,49,31]);
  assert.deepEqual(result.records.map(record=>record.remaining),[1,4,3646]);
  assert.deepEqual(result.records.map(record=>record.scanWork),[
    655928183,722453014,686821210
  ]);
  for(const record of result.records)assert.ok(record.learnerMs>0&&record.learnerMs<15000);
});
