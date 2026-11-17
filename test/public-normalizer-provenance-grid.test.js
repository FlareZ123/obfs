'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {CASES,runGrid}=require('../sims/public-normalizer-provenance-grid');

test('public-only field attacker provenance frontier has both false-positive and false-negative controls',()=>{
  const result=runGrid(4);
  assert.equal(result.shapes,19);
  assert.equal(result.cases,76);
  assert.equal(result.rows.length,result.shapes*result.seeds);
  assert.ok(result.guardedMatches>result.naiveMatches,
    'The bounded external-root policy should reduce host-key corruption');
  assert.ok(result.naiveMatches<result.cases);
  assert.ok(result.guardedMatches<result.cases);
  /** @param {string} name @returns {{naive:boolean,guarded:boolean}[]} */
  function outcomes(name){
    return result.rows.filter(row=>row.name===name);
  }
  for(const row of outcomes('owned-direct'))
    assert.deepEqual([row.naive,row.guarded],[true,true]);
  for(const row of outcomes('owned-parameter'))
    assert.deepEqual([row.naive,row.guarded],[true,false]);
  for(const row of outcomes('external-direct'))
    assert.deepEqual([row.naive,row.guarded],[false,true]);
  for(const row of outcomes('external-nested-destructure'))
    assert.deepEqual([row.naive,row.guarded],[false,false]);
  assert.equal(new Set(CASES.map(row=>row.name)).size,CASES.length);
  process.stdout.write('PUBLIC_NORMALIZER_PROVENANCE_GRID '+JSON.stringify({
    seeds:result.seeds,shapes:result.shapes,cases:result.cases,
    naiveMatches:result.naiveMatches,guardedMatches:result.guardedMatches
  })+'\n');
});
