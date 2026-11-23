'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {
  rarePrefixPermutation,adaptiveTranscript,exactPrefixCensus
}=require('../sims/rare-prefix-mask-certificate-lower-bound');

test('every rare width-nine compatible source is bijective and has a nonconstant bit-seven derivative',()=>{
  const census=exactPrefixCensus(9,7,13);
  assert.equal(census.prefixes,128);
  assert.equal(census.bijections,128);
  assert.equal(census.nonAffineScalars,128);
  assert.equal(census.budget,13);
  assert.ok(census.distinctProbedPrefixes<=13);
  assert.equal(census.indistinguishable,
    128-census.distinctProbedPrefixes);
  assert.equal(census.distinguishable,census.distinctProbedPrefixes);
  assert.ok(census.indistinguishable>=115);
  console.log('RARE_PREFIX_CERTIFIER_CENSUS '+JSON.stringify(census));
});

test('adaptive reference execution gives an exact unseen-prefix equivalence count at five budgets',()=>{
  for(const budget of [0,1,7,13,25]) {
    const census=exactPrefixCensus(9,7,budget);
    assert.equal(census.bijections,128);
    assert.equal(census.nonAffineScalars,128);
    assert.equal(census.distinctProbedPrefixes+census.indistinguishable,128);
    assert.equal(census.distinguishable,census.distinctProbedPrefixes);
    assert.ok(census.distinctProbedPrefixes<=budget);
  }
});

test('candidate scalar looks affine on untouched chosen queries yet has a nonconstant global derivative',()=>{
  const source=rarePrefixPermutation(9,7,91);
  const reference=adaptiveTranscript(x=>x,9,13);
  const observed=adaptiveTranscript(source,9,13);
  const touched=new Set(reference.map(record=>record.input&127));
  if(touched.has(91)) {
    // The test must actually select an untouched prefix to prove ambiguity.
    const unused=Array.from({length:128},(_,i)=>i).find(i=>!touched.has(i));
    assert.notEqual(unused,undefined);
    if(unused===undefined)throw new Error('No unqueried prefix');
    const fresh=rarePrefixPermutation(9,7,unused);
    assert.deepEqual(adaptiveTranscript(fresh,9,13),reference);
    const dx1=((fresh(unused)^fresh(unused^1))>>>7)&1;
    const dx2=((fresh(unused^2)^fresh((unused^2)^1))>>>7)&1;
    assert.deepEqual([dx1,dx2],[1,0]);
  }else {
    assert.deepEqual(observed,reference);
    const dx1=((source(91)^source(90))>>>7)&1;
    const dx2=((source(89)^source(88))>>>7)&1;
    assert.deepEqual([dx1,dx2],[1,0]);
  }
});
