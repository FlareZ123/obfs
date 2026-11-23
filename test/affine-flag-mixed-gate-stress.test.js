'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {invertWithPortfolio}=require('../sims/affine-flag-portfolio');
const {makeMixedRareDenseOracle}=require('../sims/affine-flag-oracle-fixtures');

test('mixed dense plus rare triangular gates preserve exact portfolio inversion on selected and ordinary targets',()=>{
  let sources=0,rareRefused=0,rareRecovered=0;
  let controlRecovered=0,controlRefused=0;
  let chosenQueries=0,maxQueries=0;
  /** @type {{sample:number,selectedRoute:string,selectedVerified:boolean,ordinaryRoute:string,ordinaryVerified:boolean}[]} */
  const rows=[];
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
    rows.push({sample,selectedRoute:selected.route,
      selectedVerified:selected.verified,ordinaryRoute:ordinary.route,
      ordinaryVerified:ordinary.verified});
    chosenQueries+=selected.queries+ordinary.queries;
    maxQueries=Math.max(maxQueries,selected.queries,ordinary.queries);
    sources++;
  }
  console.log('AFFINE_FLAG_MIXED_ROBUSTNESS '+JSON.stringify({rows,
    sources,rareRefused,rareRecovered,controlRecovered,controlRefused,
    chosenQueries,maxQueries}));
  assert.equal(sources,8);
  assert.equal(rareRefused,0,
    'Sampled derivative flags should remain valid when lower source bits are fixed');
  assert.equal(controlRecovered,8,
    'Matched ordinary source inputs must retain correct dense-flag inversion');
  assert.equal(rareRecovered+rareRefused,8);
  assert.equal(controlRecovered+controlRefused,8);
  console.log('AFFINE_FLAG_MIXED_SUMMARY '+JSON.stringify({
    sources,rareRefused,rareRecovered,controlRecovered,controlRefused,
    chosenQueries,maxQueries,gatePrefixBits:27
  }));
});
