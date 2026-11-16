'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runProfile}=require('../sims/esm-observation-session');

test('two protected ESM private fields preserve a 1-call and 2M-call cold/hot session',{
  timeout:120000
},async()=>{
  const result=await runProfile(5);
  assert.equal(result.renamedFields,2);
  assert.equal(result.samples,5);
  assert.equal(result.rows.length,2);
  assert.equal(result.rows[0].iterations,1);
  assert.equal(result.rows[1].iterations,2000000);
  assert.equal(result.allOutputsEqual,true);
  for(const row of result.rows){
    assert.ok(row.nativeProcessMs>0 && row.emittedProcessMs>0);
    assert.ok(row.processRatio>0 && Number.isFinite(row.processRatio));
    assert.ok(row.hotRatio>0 && Number.isFinite(row.hotRatio));
  }
  process.stdout.write('ESM_OBSERVATION_SESSION '+JSON.stringify(result)+'\n');
});
