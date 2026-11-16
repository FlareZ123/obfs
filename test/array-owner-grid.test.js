'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runGrid}=require('../sims/array-owner-flow-grid');

test('one-slot owner proof preserves native results over adversarial syntax grid',{
  timeout:60000
},()=>{
  assert.deepEqual(runGrid(),{
    programs:19,compilations:152,comparisons:7752,negative:11
  });
});
