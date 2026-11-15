'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runHotpath}=require('../sims/property-hotpath-closedworld');

test('closed-world hot ESM operations remain exact across three property-flow patterns',async()=>{
  const report=await runHotpath(20000,3);
  assert.equal(report.measurements.length,3);
  for(const measurement of report.measurements) {
    assert.equal(measurement.properties,2);
    assert.equal(measurement.matchingProbes,6);
    assert.ok(Number.isFinite(measurement.hotRatio));
    assert.ok(Number.isFinite(measurement.wholeRatio));
    assert.ok(measurement.sourceBytes>0&&measurement.emittedBytes>0);
  }
});
