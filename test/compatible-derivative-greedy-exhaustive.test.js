'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runCensus}=require('../sims/compatible-derivative-greedy-exhaustive');

test('all four-bit triangular sources admit completion from every exact derivative-mask choice',()=>{
  const result=runCensus();
  assert.equal(result.triangularSources,1<<15);
  assert.equal(result.permutationFailures,0,
    'Every enumerated triangular source must be a true permutation');
  assert.equal(result.allChoicesComplete,1<<15,
    'No globally valid scalar derivative choice may become a dead end');
  assert.equal(result.triangularScalarFunctions,279,
    'The 15 nonzero scalar output masks produce all 278 possible triangular component truth functions plus zero');
  assert.ok(result.rootCandidates>=1<<15,
    'Every compatible source must offer at least one global affine quotient');
  assert.equal(result.negativeControls,64);
  assert.ok(result.negativeRefusals>=50,
    'The exhaustive checker must reject unrelated permutations');
  console.log('EXACT_GREEDY_FLAG_CENSUS '+JSON.stringify(result));
});
