'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {run}=require('../sims/public-residual-extremal-construction');

test('explicit extremal residual-rank construction independently inverts r=3..8',()=>{
  const result=run();
  assert.equal(result.totalTargets,1386);
  assert.deepEqual(result.cases.map(({r,width,oracleTargets,maxQueries,maxRepairs,maxExpansions})=>
    ({r,width,oracleTargets,maxQueries,maxRepairs,maxExpansions})),[
    {r:3,width:6,oracleTargets:64,maxQueries:16,maxRepairs:3,maxExpansions:0},
    {r:4,width:8,oracleTargets:256,maxQueries:28,maxRepairs:4,maxExpansions:0},
    {r:5,width:10,oracleTargets:1024,maxQueries:47,maxRepairs:5,maxExpansions:0},
    {r:6,width:12,oracleTargets:32,maxQueries:81,maxRepairs:6,maxExpansions:0},
    {r:7,width:14,oracleTargets:8,maxQueries:112,maxRepairs:7,maxExpansions:0},
    {r:8,width:16,oracleTargets:2,maxQueries:174,maxRepairs:8,maxExpansions:0}
  ]);
});
