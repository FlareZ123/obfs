'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {
  topShear,tightTopShear,rankColumns,runEvidence
}=require('../sims/reanchor-top-shear-bound');

test('nonlinear top-only shear saturates the 35-query conditional bound',()=>{
  const secret=0xe0000000;
  const target=tightTopShear(secret);
  assert.equal(target,0x60000000);
  assert.equal(tightTopShear(target),secret);
  assert.equal(tightTopShear(0),0);
  assert.equal(tightTopShear(0x20000000),0x20000000);
  assert.equal(tightTopShear(0x40000000),0x40000000);
  const evidence=runEvidence();
  assert.equal(evidence.tightValue,secret);
  assert.equal(evidence.tightQueries,35);
  assert.equal(evidence.tightCorrections,1);
  assert.equal(evidence.sources,24);
  assert.equal(evidence.bases,384);
  assert.equal(evidence.fullRank+evidence.singular,384);
  assert.equal(evidence.exact,evidence.fullRank);
  assert.ok(evidence.fullRank>80,'Require a meaningful full-rank wrapper population');
  assert.ok(evidence.singular>0,'Verify rank refusal boundary is represented');
  assert.ok(evidence.maxQueries<=35);
  assert.ok(evidence.maxCorrections<=1);
  console.log('REANCHOR_TOP_SHEAR '+JSON.stringify(evidence));
});

test('independent column rank and nonlinear prefix controls',()=>{
  assert.equal(rankColumns(Array.from({length:32},(_,bit)=>(2**bit)>>>0)),32);
  assert.equal(rankColumns(Array.from({length:32},(_,bit)=>bit?0:1)),1);
  assert.equal(rankColumns(Array(32).fill(0)),0);
  assert.equal(topShear(0x12340000)>>>0,topShear(0x12340000));
  const a=2**29,b=2**30;
  assert.notEqual(topShear(0)^topShear(a)^topShear(b),
    topShear(a^b),'Nonlinear top-bit gate should visibly break an affine prediction');
});
