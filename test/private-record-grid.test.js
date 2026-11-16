'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runGrid}=require('../sims/private-record-grid');

test('all bounded private record slots preserve owner flow and remain source-only clonable',{
  timeout:120000
},()=>{
  assert.deepEqual(runGrid(),{
    programs:72,compilations:144,comparisons:23184,reconstructed:144
  });
});
