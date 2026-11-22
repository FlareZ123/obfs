'use strict';

const assert=require('node:assert/strict');
const {invertByReanchoring}=require('./random-affine-anchor-compatible-inversion');
const {makeFixture}=require('./sparse-triangular-fixedpoint-inversion');
const {makeRng,makeLinearTransform,applyLinear,u32}=
  require('./compatible-permutation-linear-sandwich-blackbox');

/**
 * Invertible lower-unitriangular GF(2)-linear automorphism with four
 * independently coupled output rows. The tapped input bits are never
 * modified, making B(B(z))=z while B differs from identity on most words.
 *
 * @param {number} raw
 * @returns {number}
 */
function compatibleLinearBaseline(raw) {
  const z=raw>>>0;
  let output=z;
  if((z&1)!==0)output^=2**9;
  if((z&(2**3))!==0)output^=2**18;
  if((z&(2**11))!==0)output^=2**27;
  if((z&(2**21))!==0)output^=2**30;
  return output>>>0;
}

/**
 * @returns {{sources:number,rare:number,ordinary:number,heldouts:number,
 *   rows:Array<{sourceSeed:number,mismatchedCompositeColumns:number,
 *     rareQueries:number,ordinaryQueries:number,rareCorrections:number,
 *     ordinaryCorrections:number}>}}
 */
function runEvidence() {
  const baseline=compatibleLinearBaseline;
  /** @type {Array<{sourceSeed:number,mismatchedCompositeColumns:number,
   *   rareQueries:number,ordinaryQueries:number,rareCorrections:number,
   *   ordinaryCorrections:number}>} */
  const rows=[];
  const witness=makeRng(0x31337f0a);
  for(let i=0;i<512;i++) {
    const x=witness();
    assert.equal(baseline(baseline(x)),x,'Baseline must be an involution');
  }
  let rare=0,ordinary=0,heldouts=0;
  for(let index=0;index<6;index++) {
    const seed=u32(0x42bea19c^Math.imul(index+1,0x9e3779b9));
    const fixture=makeFixture(seed);
    const outer=makeLinearTransform(fixture.sourceSeed^0xbb67ae85);
    /** @param {number} x @returns {number} */
    const oracle=x=>u32(applyLinear(outer,baseline(fixture.permutation(
      u32(applyLinear(fixture.inner,x)^fixture.innerOffset))))^
      fixture.outputOffset);
    let mismatchedCompositeColumns=0;
    for(let bit=0;bit<32;bit++) {
      const basis=u32(2**bit);
      const observed=u32(oracle(basis)^oracle(0));
      const original=applyLinear(outer,fixture.inner[bit]);
      const broadened=applyLinear(outer,baseline(fixture.inner[bit]));
      assert.equal(observed,broadened,
        'Reanchored matrix must equal hidden B-composite');
      if(observed!==original)mismatchedCompositeColumns++;
    }
    assert.ok(mismatchedCompositeColumns>0,
      'Conjugated compatible baseline differs from identity map');
    const rareResult=invertByReanchoring(oracle,oracle(fixture.secret),seed^0x4b36a1cc,1);
    const ordinaryResult=invertByReanchoring(oracle,oracle(fixture.control),seed^0x4b36a1cc,1);
    assert.equal(rareResult.value,fixture.secret);
    assert.equal(ordinaryResult.value,fixture.control);
    assert.ok(rareResult.queries<=65&&ordinaryResult.queries<=65);
    rare++;
    ordinary++;
    const next=makeRng(u32(seed^0xf1357c20));
    for(let sample=0;sample<128;sample++){
      const secret=next();
      const trial=invertByReanchoring(oracle,oracle(secret),u32(seed^sample),1);
      assert.equal(trial.value,secret);
      heldouts++;
    }
    rows.push({sourceSeed:fixture.sourceSeed,mismatchedCompositeColumns,
      rareQueries:rareResult.queries,ordinaryQueries:ordinaryResult.queries,
      rareCorrections:rareResult.corrections,ordinaryCorrections:ordinaryResult.corrections});
  }
  return {sources:rows.length,rare,ordinary,heldouts,rows};
}
if(require.main===module)console.log('COMPATIBLE_BASELINE_ANCHOR '+JSON.stringify(runEvidence()));
module.exports={compatibleLinearBaseline,runEvidence};
