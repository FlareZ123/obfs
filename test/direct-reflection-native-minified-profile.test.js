'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {run} = require('../sims/direct-reflection-native-minified-profile');

test('reflected private-owner ESM retains wrapper source and reports matched CPU', async () => {
  const result=await run(1_000_000,7);
  assert.equal(result.mode,'COO');
  assert.equal(result.sourceFields,2);
  assert.equal(result.rewrittenFields,2);
  assert.equal(result.normalizedFields,2);
  assert.equal(result.trials,7);
  assert.equal(result.rows.length,7);
  for(const row of result.rows) {
    assert.ok(row.native.cpuUs>0);
    assert.equal(row.native.value,row.protected.value);
    assert.equal(row.native.value,row.minified.value);
    assert.equal(row.native.value,row.normalizedMinified.value);
  }
  console.log(JSON.stringify(result));
});
