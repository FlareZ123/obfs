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

test('576 real native/emitted ESM graphs preserve behavior across compiler modes',async()=>{
  for(const [mode,seeds] of /** @type {const} */ ([['coo',12],['sno',6],['sco',6]])) {
    const result=await runMatrix(seeds,mode);
    assert.equal(result.mode,mode);
    assert.equal(result.graphs,seeds*24);
    assert.equal(result.scenarios,24);
    assert.equal(result.positiveGraphs,seeds);
    assert.ok(result.positiveRenames>=seeds*2);
    assert.equal(result.observedGraphs,seeds*10);
    assert.equal(result.observedUnsafeRenames,0);
    assert.equal(result.nativeEqual,true);
    process.stdout.write('ESM_OBSERVATION_MATRIX '+JSON.stringify(result)+'\n');
  }
});
