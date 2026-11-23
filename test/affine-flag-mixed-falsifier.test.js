'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {invertWithPortfolio}=require('../sims/affine-flag-portfolio');
const {makeMixedRareDenseOracle}=require('../sims/affine-flag-oracle-fixtures');

test('same dense affine source with one rare triangular gate defeats both sampled portfolio routes',()=>{
  let sources=0,rareRefused=0,rareRecovered=0;
  let controlRecovered=0,controlRefused=0;
  let chosenQueries=0,maxQueries=0;
  for(let sample=1;sample<=8;sample++) {
    const source=makeMixedRareDenseOracle(Math.imul(sample,0x85ebca6b));
    assert.notEqual(source.secret,source.control);
    assert.notEqual(source.evaluate(source.secret),
      source.baselineEvaluate(source.secret),
      'Rare selected source must actually change the published output');
    assert.equal(source.evaluate(source.control),
      source.baselineEvaluate(source.control),
      'Matched ordinary control input must avoid the rare gate');

    const options={
      reanchorSeed:Math.imul(sample+229,0x9e3779b9),
      flagSeed:Math.imul(sample+19,0x9e3779b9),
      samplesPerStage:16,maxBases:4,maxQueries:20000
    };
    const target=source.evaluate(source.secret);
    const selected=invertWithPortfolio(source.evaluate,target,options);
    if(selected.verified) {
      assert.equal(selected.input,source.secret,
        'Every accepted inversion must match exact private source preimage');
      rareRecovered++;
    }else {
      assert.equal(selected.route,'refused');
      assert.equal(selected.input,null);
      rareRefused++;
    }

    const ordinary=invertWithPortfolio(source.evaluate,
      source.evaluate(source.control),options);
    if(ordinary.verified) {
      assert.equal(ordinary.input,source.control);
      controlRecovered++;
    }else {
      assert.equal(ordinary.route,'refused');
      controlRefused++;
    }
    chosenQueries+=selected.queries+ordinary.queries;
    maxQueries=Math.max(maxQueries,selected.queries,ordinary.queries);
    sources++;
  }
  assert.equal(sources,8);
  assert.ok(rareRefused>=6,
    'Mixed source must yield a reproducible failure region of the portfolio');
  assert.ok(controlRecovered>=6,
    'Matched ordinary source inputs should retain correct dense-flag inversion');
  assert.equal(rareRecovered+rareRefused,8);
  assert.equal(controlRecovered+controlRefused,8);
  console.log('AFFINE_FLAG_MIXED_FALSIFIER '+JSON.stringify({
    sources,rareRefused,rareRecovered,controlRecovered,controlRefused,
    chosenQueries,maxQueries,gatePrefixBits:27
  }));
});
