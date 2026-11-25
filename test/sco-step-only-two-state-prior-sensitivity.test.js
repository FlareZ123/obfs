'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {analyzeTwoStatePriorSensitivity}=
  require('../sims/sco-step-only-two-state-prior-sensitivity');

test('labelled-source prior and semantic-behavior prior have different exact optimal queries',()=>{
  const result=analyzeTwoStatePriorSensitivity();
  assert.deepEqual(result,{
    sourceModels:260,
    initialBehaviors:148,
    baseline:{labelled:1992,semantic:1096},
    labelledPrior:{priorMass:260,states:2365,convergedDepth:11,
      nine:{labelled:1884,semantic:1100},
      expected:{labelled:1776,semantic:1104}},
    semanticPrior:{priorMass:148,states:2365,convergedDepth:11,
      nine:{labelled:1992,semantic:1096},
      expected:{labelled:1868,semantic:1084}},
    explicitSemantic:{nineScaled:31784,unboundedScaled:31436,
      scale:29,states:4429,convergedDepth:11},
    classSizes:{1:144,29:4}
  });
  assert.equal(result.explicitSemantic.nineScaled/result.explicitSemantic.scale,
    result.semanticPrior.nine.semantic);
  assert.equal(result.explicitSemantic.unboundedScaled/result.explicitSemantic.scale,
    result.semanticPrior.expected.semantic);
  assert.ok(result.labelledPrior.expected.semantic>result.baseline.semantic,
    'an optimal policy under one prior need not be better under another');
  console.log('SCO_TWO_STATE_PRIOR_SENSITIVITY '+JSON.stringify(result));
});
