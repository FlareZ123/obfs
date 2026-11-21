'use strict';

const assert=require('node:assert/strict');
const {learnBoundedDegreeOracle,evaluateBoundedDegreeModel}=
  require('./bounded-degree-oracle-functional-clone');
const {solveAffinePreimageCandidates}=
  require('./low-rank-affine-nonpermutation');

/** @typedef {ReturnType<typeof learnBoundedDegreeOracle>} BoundedDegreeModel */
/** @typedef {{model:BoundedDegreeModel,base:number,columns:number[],residual:number[]}} OfflineEnvelope */

/**
 * A bounded-degree model exposes a complete functional clone. Its
 * degree-two-and-higher ANF coefficients span exactly the nonlinear
 * residual space, so no extra server query is required for a target.
 * @param {BoundedDegreeModel} model
 * @returns {OfflineEnvelope}
 */
function makeOfflineEnvelope(model) {
  const bits=model.bits;
  const constant=model.coefficients.find(([mask])=>mask===0);
  assert.ok(constant);
  const columns=Array.from({length:bits},(_,bit)=>{
    const term=model.coefficients.find(([mask])=>mask===(2**bit));
    assert.ok(term);
    return term[1];
  });
  const pivots=Array(bits).fill(0);
  /** @type {number[]} */
  const residual=[];
  for(const [mask,coefficient] of model.coefficients){
    if(mask===0||(mask&(mask-1))===0)continue;
    let v=coefficient>>>0;
    for(let bit=bits-1;bit>=0;bit--){
      if(!((v>>>bit)&1))continue;
      if(pivots[bit])v=(v^pivots[bit])>>>0;
      else{pivots[bit]=v;residual.push(v);break;}
    }
  }
  return {model,base:constant[1],columns,residual};
}

/**
 * Offline target inversion or exact image-membership rejection using only
 * a serialized bounded-degree functional clone and linear elimination.
 * This function does not have a server-oracle parameter.
 * @param {OfflineEnvelope} envelope
 * @param {number} target
 * @returns {{answer:number|null,candidates:number}}
 */
function offlineInvert(envelope,target) {
  const possible=solveAffinePreimageCandidates(
    [...envelope.columns,...envelope.residual],
    (target^envelope.base)>>>0,envelope.model.bits);
  for(const x of possible){
    if(evaluateBoundedDegreeModel(envelope.model,x)===(target>>>0)){
      return {answer:x,candidates:possible.length};
    }
  }
  return {answer:null,candidates:possible.length};
}

/** @param {number} x @returns {number} */
function rotateLeft7(x){return ((x<<7)|(x>>>25))>>>0;}
/** @param {number} x @returns {number} */
function rotateRight7(x){return ((x>>>7)|(x<<25))>>>0;}

/**
 * Independent source-side reference. Nonbijective because, when bit two is
 * set, varying bit zero does not change either of the two output masks.
 * Both nonlinear output directions are independently exercised.
 * @param {number} input
 * @returns {number}
 */
function originalQuadratic(input) {
  const x=input>>>0;
  let q0=((x&1)&((x>>>2)&1));
  let q1=(((x>>>1)&1)&((x>>>3)&1));
  for(let bit=4;bit<30;bit+=2){
    q0^=((x>>>bit)&1)&((x>>>(bit+1))&1);
    q1^=((x>>>(bit+1))&1)&((x>>>(bit+2))&1);
  }
  return (rotateLeft7(x)^0x9e3779b9^(q0?0x80:0)^(q1?0x100:0))>>>0;
}

/** @param {number} seed @returns {()=>number} */
function rng(seed){let x=seed>>>0;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;};}

/**
 * Independently check image membership using the generating output coset.
 * The attack implementation never receives the output directions or this
 * private reference method.
 * @param {number} target
 * @returns {number|null}
 */
function sourceOnlyReference(target) {
  const base=rotateRight7((target^0x9e3779b9)>>>0);
  for(const low of [0,1,2,3]){
    const x=(base^low)>>>0;
    if(originalQuadratic(x)===(target>>>0))return x;
  }
  return null;
}

/** @returns {object} */
function main(){
  let attackerQueries=0,live=true;
  const model=learnBoundedDegreeOracle(x=>{
    if(!live)throw new Error('Offline attacker attempted an extra oracle call');
    attackerQueries++;
    return originalQuadratic(x);
  },32,2);
  assert.equal(attackerQueries,529);
  live=false;
  const envelope=makeOfflineEnvelope(model);
  assert.equal(envelope.residual.length,2);
  const next=rng(0x928bc120);
  let reachable=0,unreachable=0,maxCandidates=0;
  for(let i=0;i<2048;i++){
    const target=i%2===0?originalQuadratic(next()):next();
    const expected=sourceOnlyReference(target);
    const observed=offlineInvert(envelope,target);
    assert.equal(observed.answer===null,expected===null);
    if(observed.answer!==null){
      assert.equal(originalQuadratic(observed.answer),target);
      reachable++;
    }else unreachable++;
    maxCandidates=Math.max(maxCandidates,observed.candidates);
    assert.ok(observed.candidates<=4);
  }
  assert.ok(reachable>1024&&unreachable>0);
  assert.equal(attackerQueries,529);
  const summary={bits:32,degree:2,nonbijective:true,
    attackerFittingQueries:attackerQueries,postTrainingOracleCalls:0,
    publicCoefficientCount:model.coefficients.length,
    observedNonlinearResidualRank:envelope.residual.length,
    classifiedTargets:2048,reachable,unreachable,maxCandidates};
  console.log(JSON.stringify(summary));
  return summary;
}

if(require.main===module)main();
module.exports={makeOfflineEnvelope,offlineInvert,originalQuadratic,main};
