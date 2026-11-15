'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runNestedReaderGrid}=require('../sims/nested-reader-grid');

test('36 ESM reader/forwarding graphs preserve native and source-only-normalized behavior',async()=>{
  const result=await runNestedReaderGrid();
  assert.deepEqual(result,{
    graphs:36,positive:12,negative:24,
    renamedProperties:24,normalizedProperties:24
  });
  console.log('Seeded closed-world ESM ownership and static-attack grid: '+
    JSON.stringify(result));
});
