'use strict';

const assert=require('node:assert/strict');
const {
  invert3,allLinear3,compatible3,apply
}=require('./sparse-triangular-fixedpoint-width3-peer');

/**
 * All eight lower-unitriangular invertible linear maps at 3-bit width.
 * The three strict-lower coefficients are the bits of mask.
 *
 * @param {number} mask
 * @param {number} value
 * @returns {number}
 */
function linearCompatible3(mask,value){
  const z=value&7;
  let out=z;
  if(mask&1)out^=(z&1)<<1;
  if(mask&2)out^=(z&1)<<2;
  if(mask&4)out^=(z&2)<<1;
  return out&7;
}

/**
 * Complete finite-width independent crosscheck of the generalized
 * anchored inversion condition: sample differences recover a hidden
 * L_out∘B∘L_in, where B is any compatible linear automorphism, rather
 * than merely L_out∘L_in. Conditional admission uses source-known
 * P-differences. Inverter only sees the blackbox oracle and target.
 *
 * @returns {{compatiblePermutations:number,innerLinearMaps:number,
 *   outerMaps:number,innerOffsets:number,compatibleLinearBaselines:number,
 *   sourceCleanConfigurations:number,exactRecoveries:number,
 *   nonIdentityBaselineRecoveries:number,sourceMismatches:number,
 *   maxQueries:number,maxCorrections:number}}
 */
function runEvidence(){
  const innerMaps=allLinear3();
  const outerMaps=[innerMaps[0],innerMaps[84]];
  const offsets=[0,5];
  let sourceCleanConfigurations=0,exactRecoveries=0;
  let nonIdentityBaselineRecoveries=0,sourceMismatches=0;
  let maxQueries=0,maxCorrections=0;
  for(let config=0;config<128;config++) {
    /** @param {number} z @returns {number} */
    const permutation=z=>compatible3(config,z);
    for(const inner of innerMaps)for(const b of offsets){
      const center=permutation(b);
      if(!inner.every(col=>(permutation(col^b)^center)===col))continue;
      sourceCleanConfigurations++;
      for(let baseline=0;baseline<8;baseline++) {
        for(const outer of outerMaps){
          const outOffset=(config^b^baseline)&7;
          /** @param {number} x @returns {number} */
          const oracle=x=>apply(outer,linearCompatible3(baseline,
            permutation(apply(inner,x)^b)))^outOffset;
          for(let bit=0;bit<3;bit++) {
            const col=inner[bit];
            const expected=apply(outer,linearCompatible3(baseline,col));
            const observed=oracle(1<<bit)^oracle(0);
            assert.equal(observed,expected,
              'Anchor observation must expose B-composite');
            if(observed!==apply(outer,col))sourceMismatches++;
          }
          for(let secret=0;secret<8;secret++) {
            const result=invert3(oracle,oracle(secret));
            assert.equal(result.value,secret,
              'Generalized B-composite source='+config+' baseline='+baseline);
            assert.ok(result.queries<=7);
            exactRecoveries++;
            if(baseline!==0)nonIdentityBaselineRecoveries++;
            maxQueries=Math.max(maxQueries,result.queries);
            maxCorrections=Math.max(maxCorrections,result.corrections);
          }
        }
      }
    }
  }
  assert.equal(sourceCleanConfigurations,4992);
  assert.equal(exactRecoveries,sourceCleanConfigurations*8*2*8);
  assert.equal(nonIdentityBaselineRecoveries,sourceCleanConfigurations*7*2*8);
  assert.ok(sourceMismatches>0);
  return {compatiblePermutations:128,innerLinearMaps:168,outerMaps:2,
    innerOffsets:2,compatibleLinearBaselines:8,
    sourceCleanConfigurations,exactRecoveries,nonIdentityBaselineRecoveries,
    sourceMismatches,maxQueries,maxCorrections};
}
if(require.main===module)console.log('COMPATIBLE_BASELINE_WIDTH3 '+JSON.stringify(runEvidence()));
module.exports={linearCompatible3,runEvidence};
