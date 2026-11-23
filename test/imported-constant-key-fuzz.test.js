'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {run}=require('../sims/imported-constant-key-fuzz');

test('acyclic ESM owner/key declaration order remains safe in either order',async()=>{
  const result=await run(8);
  assert.equal(result.positives,8);
  assert.equal(result.declined,0);
  assert.equal(result.normalized,8);
});
