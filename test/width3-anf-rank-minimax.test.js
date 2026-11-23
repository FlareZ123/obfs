'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runWidthThreeAnfRankMinimax}=
  require('../sims/width3-anf-rank-minimax');

test('exact minimax 3-bit nonlinear output ANF rank ceiling 0,1,2,3 costs 4,5,6,7',()=>{
  const result=runWidthThreeAnfRankMinimax();
  assert.equal(result.allPermutations,40320);
  assert.deepEqual(result.nonlinearRankHistogram,
    [1344,9408,18816,10752]);
  assert.deepEqual(result.classes.map(x=>x.uniqueSources),
    [1344,10752,29568,40320]);
  assert.deepEqual(result.classes.map(x=>x.upperBound),
    [4,5,6,7]);
  assert.deepEqual(result.classes.map(x=>x.lowerBound),
    [3,4,5,6]);
  for(const row of result.classes){
    assert.equal(row.exactTargets,row.uniqueSources);
    assert.equal(row.queryHistogram.reduce((a,b)=>a+b,0),row.uniqueSources);
  }
  console.log('WIDTH3_ANF_RANK_MINIMAX '+JSON.stringify(result));
});
