'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runWidthThreeRankOneMinimax}=
  require('../sims/rankone-width3-minimax-inversion');

test('exact minimax: all 3-bit rank-one source permutations invert in five queries but not four',()=>{
  const result=runWidthThreeRankOneMinimax();
  assert.equal(result.uniquePermutations,10752);
  assert.equal(result.parameterizedForms,150528);
  assert.equal(result.targetCases,86016);
  assert.equal(result.exactInversions,86016);
  assert.equal(result.fourQueriesSuffice,false);
  assert.equal(result.fiveQueriesSuffice,true);
  assert.equal(result.minimaxWorstQueries,5);
  assert.deepEqual(result.queryHistogram,[0,10752,10752,10752,14784,38976]);
  console.log('RANKONE_WIDTH3_MINIMAX '+JSON.stringify(result));
});
