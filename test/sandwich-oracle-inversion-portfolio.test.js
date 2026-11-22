'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {invertPortfolio}=require('../sims/sandwich-oracle-inversion-portfolio');
const {fixture}=require('../sims/sandwich-cegar-hard-family-stress');

test('oracle-only portfolio recovers exceptional rank-one source within 36 chosen queries',()=>{
  const sample=fixture('sparse-forced-top-bit',7);
  const recovered=invertPortfolio(sample.oracle,sample.target,sample.attackSeed);
  assert.equal(recovered.value,sample.secret);
  assert.equal(recovered.method,'rank-one-interpolation');
  assert.ok(recovered.queryCount<=36);
});

test('oracle-only portfolio falls back to CEGAR for a quartic triangular source',()=>{
  const sample=fixture('triangular-degree-4',0);
  const recovered=invertPortfolio(sample.oracle,sample.target,sample.attackSeed);
  assert.equal(recovered.value,sample.secret);
  assert.equal(sample.oracle(/** @type {number} */(recovered.value)),sample.target);
  assert.ok(['rank-one-interpolation','cegar-eight-check','cegar-historical-128']
    .includes(/** @type {string} */(recovered.method)));
});

test('oracle-only portfolio verifies an affine public-target inverse',()=>{
  /** @param {number} x @returns {number} */
  const oracle=x=>x>>>0;
  const secret=0x435713ea;
  const recovered=invertPortfolio(oracle,secret,0x12acb391);
  assert.equal(recovered.value,secret);
  assert.ok(recovered.queryCount<=36);
});
