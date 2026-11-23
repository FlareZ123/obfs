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
/**
 * @param {()=>number} next
 * @returns {number[]}
 */
function tinyInvertible(next) {
  const columns=Array.from({length:8},(_,bit)=>1<<bit);
  for(let i=0;i<96;i++){
    const a=next()%8,b=next()%8;
    if(a===b)continue;
    if(next()&1)[columns[a],columns[b]]=[columns[b],columns[a]];
    else columns[a]^=columns[b];
  }
  return columns;
}

/** @param {number[]} columns @param {number} input @returns {number} */
function tinyLinear(columns,input) {
  let out=0;
  for(let bit=0;bit<8;bit++)if((input>>>bit)&1)out^=columns[bit];
  return out;
}

/**
 * Same construction as the wider oracle but on all 256 inputs, permitting
 * a complete exact ANF nonlinear output-rank and algebraic-degree audit.
 * @param {number} seed
 * @param {number} layers
 * @returns {(input:number)=>number}
 */
function tinyLayeredOracle(seed,layers) {
  const next=seeded(seed);
  const inputMatrix=tinyInvertible(next),initialOffset=next()&255;
  const stages=Array.from({length:layers},()=>({
    columns:tinyInvertible(next),offset:next()&255,
    affineMask:next()&127
  }));
  const outputMatrix=tinyInvertible(next),finalOffset=next()&255;
  return input=>{
    let value=tinyLinear(inputMatrix,input)^initialOffset;
    for(const stage of stages){
      const quadratic=(value&1)&((value>>>1)&1);
      const control=quadratic^parity32(value&stage.affineMask);
      if(control)value^=128;
      value=tinyLinear(stage.columns,value)^stage.offset;
    }
    return tinyLinear(outputMatrix,value)^finalOffset;
  };
}

/**
 * @param {(input:number)=>number} oracle
 * @returns {{degree:number,nonlinearOutputRank:number}}
 */
function tinyAnf(oracle) {
  const coefficients=Array.from({length:256},(_,input)=>oracle(input));
  assert.equal(new Set(coefficients).size,256);
  for(let bit=0;bit<8;bit++){
    for(let monomial=0;monomial<256;monomial++){
      if((monomial>>>bit)&1)
        coefficients[monomial]^=coefficients[monomial^(1<<bit)];
    }
  }
  /** @type {number[]} */
  const nonlinear=[];
  let degree=0;
  for(let monomial=0;monomial<256;monomial++){
    let cardinality=0;
    for(let bit=0;bit<8;bit++)cardinality+=(monomial>>>bit)&1;
    if(coefficients[monomial]!==0)degree=Math.max(degree,cardinality);
    if(cardinality>=2)nonlinear.push(coefficients[monomial]);
  }
  const pivots=Array(8).fill(0);
  let nonlinearOutputRank=0;
  for(const value of nonlinear){
    let current=value;
    for(let bit=7;bit>=0&&current!==0;bit--){
      if(!((current>>>bit)&1))continue;
      if(pivots[bit])current^=pivots[bit];
      else{pivots[bit]=current;nonlinearOutputRank++;break;}
    }
  }
  return {degree,nonlinearOutputRank};
}

/**
 * Exact complete eight-bit source-table audit, as distinct from a sample of
 * chosen queries. Measures whether genuine algebraic degree can grow while
 * the global nonlinear output rank remains constrained by layer count.
 *
 * @returns {{samples:number,byLayers:{layers:number,sources:number,
 *   maximumDegree:number,maximumRank:number,fullRankSources:number,
 *   degreeAtLeastLayers:number}[]}}
 */
function runTinyLayeredAnfAudit() {
  const byLayers=[];
  let samples=0;
  for(let layers=1;layers<=6;layers++){
    let maximumDegree=0,maximumRank=0,fullRankSources=0;
    let degreeAtLeastLayers=0;
    for(let trial=0;trial<48;trial++){
      const seed=(0x918dfacf^Math.imul(layers,0x85ebca6b)^
        Math.imul(trial+1,0xc2b2ae35))>>>0;
      const data=tinyAnf(tinyLayeredOracle(seed,layers));
      assert.ok(data.nonlinearOutputRank<=layers);
      if(data.nonlinearOutputRank===layers)fullRankSources++;
      if(data.degree>=layers)degreeAtLeastLayers++;
      maximumDegree=Math.max(maximumDegree,data.degree);
      maximumRank=Math.max(maximumRank,data.nonlinearOutputRank);
      samples++;
    }
    byLayers.push({layers,sources:48,maximumDegree,maximumRank,
      fullRankSources,degreeAtLeastLayers});
  }
  assert.equal(samples,288);
  assert.ok(byLayers[5].maximumDegree>=6);
  assert.ok(byLayers[5].maximumRank>=5);
  return {samples,byLayers};
}

/**
 * Oracle-only exact ANF interpolation with a promised total degree bound.
 * Query all and only Hamming-weight<=degree source positions, then derive
 * each ANF coefficient by downward Boolean-Moebius inversion. No source,
 * internal matrix, gate count proof, or hidden private state is read.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} degree
 * @returns {{predict:(input:number)=>number,oracleCalls:number}}
 */
function tinyDegreeClone(oracle,degree) {
  assert.ok(Number.isInteger(degree)&&degree>=0&&degree<=8);
  const coefficients=Array(256).fill(0);
  let oracleCalls=0;
  for(let mask=0;mask<256;mask++) {
    let cardinality=0;
    for(let bit=0;bit<8;bit++)cardinality+=(mask>>>bit)&1;
    if(cardinality>degree)continue;
    let value=oracle(mask);
    let subset=(mask-1)&mask;
    while(subset!==mask){
      value^=coefficients[subset];
      subset=(subset-1)&mask;
    }
    coefficients[mask]=value;
    oracleCalls++;
  }
  /** @param {number} input @returns {number} */
  function predict(input) {
    let result=0;
    let subset=input;
    while(true) {
      result^=coefficients[subset];
      if(subset===0)break;
      subset=(subset-1)&input;
    }
    return result;
  }
  return {predict,oracleCalls};
}

/**
 * Complete held-out clone check for affine-mixed compositions of independent
 * quadratic rank-one shears, one Boolean AND per stage. All output
 * coordinates have algebraic degree <= min(n,layers+1) by the standard
 * multiplicative-complexity degree bound, independently verified by the
 * full ANF audit. This is an executable attacker rather than a source-only
 * prediction: it sees only the public function oracle and promised degree.
 *
 * @returns {{sourceFunctions:number,allPredictions:number,
 *   heldoutPredictions:number,
 *   byLayers:{layers:number,queries:number,sourceFunctions:number,
 *      verifiedOutputs:number,heldoutOutputs:number}[]}}
 */
function runTinyBoundedDegreeCloner() {
  const byLayers=[];
  let sourceFunctions=0,allPredictions=0,heldoutPredictions=0;
  for(let layers=1;layers<=6;layers++){
    const degree=Math.min(8,layers+1);
    let queries=-1,localSources=0,verifiedOutputs=0,heldoutOutputs=0;
    for(let trial=0;trial<24;trial++){
      const seed=(0x8a71c2be^Math.imul(layers,0x9e3779b1)^
        Math.imul(trial+1,0x7f4a7c15))>>>0;
      const oracle=tinyLayeredOracle(seed,layers);
      const attack=tinyDegreeClone(oracle,degree);
      queries=attack.oracleCalls;
      for(let input=0;input<256;input++){
        assert.equal(attack.predict(input),oracle(input));
        let weight=0;
        for(let bit=0;bit<8;bit++)weight+=(input>>>bit)&1;
        if(weight>degree){heldoutPredictions++;heldoutOutputs++;}
        allPredictions++;verifiedOutputs++;
      }
      localSources++;sourceFunctions++;
    }
    const expected=Array.from({length:256},(_,mask)=>{
      let weight=0;
      for(let bit=0;bit<8;bit++)weight+=(mask>>>bit)&1;
      return weight<=degree?1:0;
    }).reduce((a,b)=>a+b,0);
    assert.equal(queries,expected);
    assert.equal(heldoutOutputs,24*(256-queries));
    byLayers.push({layers,queries,sourceFunctions:localSources,
      verifiedOutputs,heldoutOutputs});
  }
  assert.equal(sourceFunctions,144);
  assert.equal(allPredictions,144*256);
  assert.equal(heldoutPredictions,12528);
  return {sourceFunctions,allPredictions,heldoutPredictions,byLayers};
}

if(require.main===module){
  process.stdout.write('LAYERED_LOWRANK_COMPOSITION '+
    JSON.stringify(runLayeredLowRankComposition())+'\n');
}
module.exports={makeLayeredOracle,runLayeredLowRankComposition,
  runTinyLayeredAnfAudit,runTinyBoundedDegreeCloner};
