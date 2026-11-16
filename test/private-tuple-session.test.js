'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runProfile}=require('../sims/private-tuple-session');

test('private tuple end-to-end cold session measures compile, initialization and complete execution',{
  timeout:120000
},()=>{
  const report=runProfile();
  assert.equal(report.renamedProperties,2);
  assert.deepEqual(report.rows.map(row=>row.operations),[1,100,10000,500000]);
  for(const row of report.rows){
    assert.equal(row.samples.length,11);
    assert.equal(row.nativeSamples.length,11);
    assert.ok(Number.isFinite(row.ratio) && row.ratio>0);
    assert.ok(row.medianNativeMs>0);
  }
  // A bounded performance observation is logged. No universal or flaky
  // microbenchmark ratio is asserted as a correctness requirement.
  process.stdout.write('PRIVATE_TUPLE_COLD_PROFILE '+JSON.stringify({
    node:report.node,platform:report.platform,
    sourceBytes:report.sourceBytes,outputBytes:report.outputBytes,
    rows:report.rows.map(({operations,medianNativeMs,medianProtectedMs,ratio,within2point5})=>({
      operations,medianNativeMs,medianProtectedMs,ratio,within2point5
    }))
  })+'\n');
});
