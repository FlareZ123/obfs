'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runExactConjugatedCensus}=
  require('../sims/conjugated-rare-first-mask-selection');

test('all hidden four-bit conjugated rare shears have the predicted global first-mask distribution',()=>{
  const result=runExactConjugatedCensus();
  assert.equal(result.matrices,20160);
  assert.equal(result.sources,80640);
  assert.equal(result.permutations,80640,
    'Every hidden conjugated rare gate must remain an exact permutation');
  assert.equal(result.nonlinearSecondDifferences,80640,
    'Every rare perturbation must have a nonzero global-affinity counterexample');
  assert.equal(result.validMasksPerSource,7);
  assert.equal(result.fixedMaskValidSources,37632);
  assert.equal(result.masksUniform,true,
    'Every nonzero fixed output scalar has exactly 7/15 validity over uniform matrices');
  assert.equal(result.oneProbeHits,20160);
  assert.equal(result.oneProbeSuccessfulSelections,48384);
  assert.equal(result.oneProbeFailures,32256);
  assert.equal(result.firstMaskSuccessFraction,'7/15');
  assert.equal(result.oneProbeSuccessFraction,'3/5');
  console.log('CONJUGATED_RARE_FLAG_CENSUS '+JSON.stringify(result));
});
