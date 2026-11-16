'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runGrid}=require('../sims/private-tuple-grid');

test('fixed primitive tuple owner flow: exhaustive bounded positions and independent source-only copy',{
  timeout:120000
},()=>{
  assert.deepEqual(runGrid(),{
    programs:36,compilations:72,comparisons:11592,sourceOnlyRecoveries:72
  });
});
