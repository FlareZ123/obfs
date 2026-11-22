'use strict';

const assert=require('node:assert/strict');
const {poisonCanonicalAnchor}=require('./random-affine-anchor-compatible-inversion');
const {makeRng,u32}=require('./compatible-permutation-linear-sandwich-blackbox');

/**
 * Audit the *private source* basis-cleanliness condition. This procedure
 * does not participate in attacker inversion, and it never uses oracle
 * outputs to infer which bases are clean.
 *
 * Samples use a seeded xorshift generator for cross-OS reproducibility.
 * Those samples are not statistically independent ideal-uniform draws;
 * the separate union-bound theorem explicitly assumes real fresh
 * independent uniform bits.
 *
 * @returns {{sources:number,basesPerSource:number,clean:number,dirty:number,
 *   initialDirty:number,rows:Array<{sourceSeed:number,clean:number,
 *   dirty:number,cleanFraction:number}>}}
 */
function runCoverage() {
  const basesPerSource=4096;
  let clean=0,dirty=0,initialDirty=0;
  /** @type {Array<{sourceSeed:number,clean:number,dirty:number,cleanFraction:number}>} */
  const rows=[];
  for(let index=0;index<6;index++){
    const seed=u32(0x2026a114^Math.imul(index+1,0x9e3779b9));
    const fixture=poisonCanonicalAnchor(seed);
    const next=makeRng(u32(0x33c66ed2^Math.imul(index+1,0x7f4a7c15)));
    let sourceClean=0,sourceDirty=0;
    if(!fixture.cleanAt(0))initialDirty++;
    for(let draw=0;draw<basesPerSource;draw++){
      const anchor=next();
      if(fixture.cleanAt(anchor))sourceClean++;
      else sourceDirty++;
    }
    clean+=sourceClean;
    dirty+=sourceDirty;
    rows.push({sourceSeed:fixture.sourceSeed,clean:sourceClean,
      dirty:sourceDirty,cleanFraction:sourceClean/basesPerSource});
  }
  assert.equal(initialDirty,6);
  assert.equal(clean+dirty,6*basesPerSource);
  return {sources:6,basesPerSource,clean,dirty,initialDirty,rows};
}
if(require.main===module)console.log('SPARSE_ANCHOR_COVERAGE '+JSON.stringify(runCoverage()));
module.exports={runCoverage};
