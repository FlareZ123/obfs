'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {main}=require('../sims/private-class-symbol-cost');

test('private class Symbol-key backend preserves hot CPU and cold whole-process budget',async()=>{
  const result=await main();
  assert.equal(result.properties,2);
  assert.equal(result.rows.length,3);
  assert.ok(result.rows.every(row=>row.withinWholeBudget));
  assert.ok(result.rows[2].withinHotBudget===true);
});
