'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {invertWithPortfolio}=require('../sims/affine-flag-portfolio');
const {
  makeDenseOracle,makeRareAffineOracle,makeFeistelOracle
}=require('../sims/affine-flag-oracle-fixtures');

test('two-route chosen-oracle portfolio solves dense and rare 32-bit compatible permutations',()=>{
  let denseFlag=0,denseReanchor=0,rareFlag=0,rareReanchor=0;
  let uniqueQueries=0,maxQueries=0,exactTargets=0;
  for(let sample=1;sample<=20;sample++) {
    const source=makeDenseOracle(32,Math.imul(sample,0x85ebca6b));
    const secret=(Math.imul(sample,0x27d4eb2d)^Math.imul(sample*3,0x9e3779b9))>>>0;
    const target=source.evaluate(secret);
    const result=invertWithPortfolio(source.evaluate,target,{
      reanchorSeed:Math.imul(sample+229,0x9e3779b9),
      flagSeed:Math.imul(sample+19,0x9e3779b9),
      samplesPerStage:16,maxBases:4
    });
    assert.equal(result.verified,true,'Dense chosen target must be recovered');
    assert.equal(result.input,secret,'Dense source secret must be exact');
    if(result.route==='sampled-flag')denseFlag++;
    if(result.route==='reanchor')denseReanchor++;
    assert.ok(result.queries<=20000);
    uniqueQueries+=result.queries;
    maxQueries=Math.max(maxQueries,result.queries);
    exactTargets++;
  }
  for(let sample=1;sample<=8;sample++) {
    const source=makeRareAffineOracle(Math.imul(sample+173,0x9e3779b9));
    const target=source.evaluate(source.secret);
    const result=invertWithPortfolio(source.evaluate,target,{
      reanchorSeed:Math.imul(sample+37,0x9e3779b9),
      flagSeed:Math.imul(sample+991,0x85ebca6b),
      samplesPerStage:16,maxBases:4
    });
    assert.equal(result.verified,true,'Rare-gate target must be recovered');
    assert.equal(result.input,source.secret,'Rare-gate source secret must be exact');
    if(result.route==='sampled-flag')rareFlag++;
    if(result.route==='reanchor')rareReanchor++;
    assert.ok(result.queries<=20000);
    uniqueQueries+=result.queries;
    maxQueries=Math.max(maxQueries,result.queries);
    exactTargets++;
  }
  assert.equal(exactTargets,28);
  assert.equal(denseFlag+denseReanchor,20);
  assert.equal(rareFlag+rareReanchor,8);
  assert.ok(denseFlag>=1,'Dense nonlinear sources need the sampled flag route');
  assert.ok(rareReanchor>=1,'Sparse source must exercise the cheap reanchor route');
  console.log('AFFINE_FLAG_PORTFOLIO '+JSON.stringify({
    exactTargets,denseFlag,denseReanchor,rareFlag,rareReanchor,
    uniqueQueries,maxQueries
  }));
});

test('a reversible 32-bit Feistel control is refused if neither exact attack succeeds',()=>{
  let refused=0,verified=0;
  for(let sample=1;sample<=4;sample++) {
    const oracle=makeFeistelOracle(Math.imul(sample,0x9e3779b9));
    const secret=(Math.imul(sample,0x85ebca6b)^Math.imul(sample+3,0xc2b2ae35))>>>0;
    const target=oracle(secret);
    const result=invertWithPortfolio(oracle,target,{
      reanchorSeed:Math.imul(sample+33,0x9e3779b9),
      flagSeed:Math.imul(sample+47,0x85ebca6b),
      samplesPerStage:16,maxBases:4
    });
    if(result.verified) {
      assert.equal(result.input,secret,'A verified candidate must be the exact preimage');
      verified++;
    }else {
      assert.equal(result.route,'refused');
      assert.equal(result.input,null);
      refused++;
    }
  }
  assert.ok(refused>=3,'Unrelated Feistel controls must usually refuse');
  console.log('AFFINE_FLAG_FEISTEL '+JSON.stringify({
    trials:4,refused,verified
  }));
});
