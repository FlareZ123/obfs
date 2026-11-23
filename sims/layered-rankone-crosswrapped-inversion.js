'use strict';
const assert=require('node:assert/strict');
const {invertLowRankDeterministic}=require('./affine-low-rank-oracle');

/**
 * Adversarial oracle tests for the entire composition of many rank-one
 * nonlinear shears interleaved with arbitrary invertible affine maps.
 *
 * Each individual shear is a true nonlinear triangular permutation. Their
 * algebraic degree can grow under composition, but the global output's
 * affine-residual rank is bounded by the sum of per-layer displacement ranks.
 * This file checks the established deterministic low-rank inverter directly.
 */

/** @param {number} seed @returns {()=>number} */
function seeded(seed) {
  let v=seed>>>0;
  return ()=>{
    v^=v<<13;v^=v>>>17;v^=v<<5;
    return v>>>0;
  };
}

/** @param {number} x @returns {number} */
function parity32(x) {
  let z=x>>>0;
  z^=z>>>16;z^=z>>>8;z^=z>>>4;
  return (0x6996>>>(z&15))&1;
}

/** @param {number[]} columns @param {number} input @returns {number} */
function applyLinear(columns,input) {
  let out=0;
  for(let i=0;i<32;i++)if((input>>>i)&1)out^=columns[i];
  return out>>>0;
}

/** @param {()=>number} next @returns {number[]} */
function matrix(next) {
  const columns=Array.from({length:32},(_,bit)=>(1<<bit)>>>0);
  for(let trial=0;trial<320;trial++){
    const a=next()%32,b=next()%32;
    if(a===b)continue;
    if(next()&1)[columns[a],columns[b]]=[columns[b],columns[a]];
    else columns[a]=(columns[a]^columns[b])>>>0;
  }
  return columns;
}

/**
 * @param {number} seed
 * @param {number} layers
 * @returns {(input:number)=>number}
 */
function makeLayeredOracle(seed,layers) {
  assert.ok(Number.isInteger(layers)&&layers>=1&&layers<=5);
  const next=seeded(seed);
  const inputMatrix=matrix(next),initialOffset=next();
  const stages=Array.from({length:layers},()=>({
    columns:matrix(next),offset:next(),affineMask:next()&0x7fffffff
  }));
  const outputMatrix=matrix(next),finalOffset=next();
  /** @param {number} x @returns {number} */
  return x=>{
    let value=(applyLinear(inputMatrix,x)^initialOffset)>>>0;
    for(const stage of stages){
      // Genuine quadratic top-bit control, unchanged by flipping bit 31.
      const quadratic=(value&1)&((value>>>1)&1);
      const control=quadratic^parity32(value&stage.affineMask);
      if(control)value=(value^0x80000000)>>>0;
      value=(applyLinear(stage.columns,value)^stage.offset)>>>0;
    }
    return (applyLinear(outputMatrix,value)^finalOffset)>>>0;
  };
}

/** @param {number[]} vectors @returns {number} */
function rank(vectors) {
  const pivots=Array(32).fill(0);
  let result=0;
  for(const raw of vectors) {
    let z=raw>>>0;
    for(let bit=31;bit>=0&&z!==0;bit--){
      if(!((z>>>bit)&1))continue;
      if(pivots[bit])z=(z^pivots[bit])>>>0;
      else{pivots[bit]=z;result++;break;}
    }
  }
  return result;
}

/**
 * @returns {{sources:number,targets:number,exactInversions:number,
 *   residualRankViolations:number,rankFullSources:number,maximumQueries:number,
 *   maximumNullity:number,byLayers:{layers:number,sources:number,targets:number,
 *      maxCalls:number,rankFull:number,maximumResidualRank:number}[]}}
 */
function runLayeredLowRankComposition() {
  const byLayers=[];
  let sources=0,targets=0,exactInversions=0,residualRankViolations=0;
  let rankFullSources=0,maximumQueries=0,maximumNullity=0;
  for(let layers=1;layers<=5;layers++){
    let localSources=0,localTargets=0,maxCalls=0,rankFull=0;
    let maximumResidualRank=0;
    for(let iteration=0;iteration<12;iteration++){
      const seed=(0x547af12b^Math.imul(layers,0x9e3779b1)^
        Math.imul(iteration+1,0x7f4a7c15))>>>0;
      const oracle=makeLayeredOracle(seed,layers);
      const next=seeded(seed^0x195e1c37);
      const base=oracle(0);
      const columns=Array.from({length:32},(_,i)=>
        (oracle((1<<i)>>>0)^base)>>>0);
      const residuals=Array.from({length:160},()=>{
        const input=next();
        return (oracle(input)^base^applyLinear(columns,input))>>>0;
      });
      const measured=rank(residuals);
      maximumResidualRank=Math.max(maximumResidualRank,measured);
      if(measured>layers)residualRankViolations++;
      if(measured===layers){rankFull++;rankFullSources++;}
      for(let targetIndex=0;targetIndex<3;targetIndex++){
        const secret=next(),target=oracle(secret);
        const inverted=invertLowRankDeterministic(oracle,target,{
          bits:32,rankBound:layers
        });
        assert.equal(inverted.preimage,secret);
        assert.equal(oracle(inverted.preimage),target);
        assert.ok(inverted.oracleCalls<=33+2**(2*layers),
          'Composition must remain within the existing low-rank bound');
        maxCalls=Math.max(maxCalls,inverted.oracleCalls);
        maximumQueries=Math.max(maximumQueries,inverted.oracleCalls);
        maximumNullity=Math.max(maximumNullity,inverted.nullity);
        localTargets++;targets++;exactInversions++;
      }
      sources++;localSources++;
    }
    byLayers.push({layers,sources:localSources,targets:localTargets,
      maxCalls,rankFull,maximumResidualRank});
  }
  assert.equal(sources,60);
  assert.equal(targets,180);
  assert.equal(exactInversions,targets);
  assert.equal(residualRankViolations,0);
  return {sources,targets,exactInversions,residualRankViolations,
    rankFullSources,maximumQueries,maximumNullity,byLayers};
}
if(require.main===module){
  process.stdout.write('LAYERED_LOWRANK_COMPOSITION '+
    JSON.stringify(runLayeredLowRankComposition())+'\n');
}
module.exports={makeLayeredOracle,runLayeredLowRankComposition};
