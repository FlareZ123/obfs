'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {SCENARIOS,makeFixture,runMatrix}=require('../sims/esm-observation-matrix');

test('24 observation patterns produce distinct source-visible ESM owners',()=>{
  assert.equal(SCENARIOS.length,24);
  assert.equal(new Set(SCENARIOS).size,24);
  for(let index=0;index<SCENARIOS.length;index++){
    const fixture=makeFixture(0,index);
    assert.equal(fixture.scenario,SCENARIOS[index]);
    assert.ok(fixture.files.some(file=>file.path==='state.mjs'));
    assert.ok(fixture.files.some(file=>file.path==='entry.mjs'));
  }
});

test('288 real native/emitted ESM graphs preserve behavior with measured safe-key yield',async()=>{
  const result=await runMatrix(12);
  assert.equal(result.graphs,288);
  assert.equal(result.scenarios,24);
  assert.equal(result.positiveGraphs,12);
  assert.ok(result.positiveRenames>=24);
  assert.equal(result.observedGraphs,120);
  assert.equal(result.observedUnsafeRenames,0);
  assert.equal(result.nativeEqual,true);
});
