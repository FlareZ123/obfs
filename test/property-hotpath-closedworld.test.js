'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runHotpath}=require('../sims/property-hotpath-closedworld');

// The benchmark deliberately retains only its source-stable wrapped form.
// The former direct/readers/identity arms put keys in exported callable source
// and are no longer admitted as positive property-renaming measurements.
test('closed-world hot ESM wrapped source-stable operation remains exact',async()=>{
  const report=await runHotpath(20000,3);
  assert.equal(report.measurements.length,1);
  for(const measurement of report.measurements) {
    assert.equal(measurement.style,'wrapped');
    assert.equal(measurement.properties,2);
    assert.equal(measurement.matchingProbes,6);
    assert.ok(Number.isFinite(measurement.hotRatio));
    assert.ok(Number.isFinite(measurement.wholeRatio));
    assert.ok(measurement.sourceBytes>0&&measurement.emittedBytes>0);
  }
});
