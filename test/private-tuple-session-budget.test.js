'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runProfile}=require('../sims/private-tuple-session');

test('private tuple session preserves behavior and stays within the 2.5x runtime budget',()=>{
  const report=runProfile();
  assert.equal(report.renamedProperties,2);
  assert.ok(report.rows.length>=4);
  for(const row of report.rows) {
    assert.equal(row.within2point5,true,
      'runtime ratio '+row.ratio+' exceeded 2.5x at '+row.operations+' operations');
  }
});
