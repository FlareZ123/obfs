'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {run}=require('../sims/third-module-key-fuzz');

test('acyclic owner-first and key-later exports remain positive while true cycle and reflection controls decline',async()=>{
  const result=await run(10);
  assert.equal(result.accepted,6);
  assert.equal(result.declined,4);
  assert.equal(result.normalized,6);
});
