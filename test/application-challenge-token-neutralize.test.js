'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {run}=require('../sims/application-challenge-token-neutralize');

test('source-only token normalization preserves both genuinely transformed ESM application contracts',async()=>{
  const rows=await run(2);
  assert.equal(rows.length,4);
  assert.deepEqual([...new Set(rows.map(row=>row.variant))],['own-only','null-proto']);
  for(const row of rows){
    assert.equal(row.renamed,2);
    assert.ok(row.normalizedProperties>=2);
    assert.equal(row.differentialCases,84);
    assert.equal(row.heldoutCases,160);
    assert.equal(row.publicOnlyAttackerMatched,true);
  }
});
