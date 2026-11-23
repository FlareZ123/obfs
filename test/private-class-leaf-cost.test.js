'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {main}=require('../sims/private-class-leaf-cost');

test('bounded class leaf preserves numeric output, source-only attack and paired CPU budget',async()=>{
  const outcome=await main();
  assert.equal(outcome.properties,2);
  assert.equal(outcome.rows.length,3);
  assert.ok(outcome.rows.every(row=>row.attackerCloneEqual));
});
