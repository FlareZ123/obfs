'use strict';

const {parity,solveLinear}=require('./two-sided-affine-degree-inversion');
const {evaluateBoundedDegreeModel}=
  require('./bounded-degree-oracle-functional-clone');

/**
 * Algebraic preimage of an unknown two-sided affine-wrapped triangular
 * *quadratic* permutation from its previously recovered complete ANF.
 * This is an attacker-side offline tool, not an obfuscation feature.
 *
 * Given F = Aout o P o Ain, where Ain and Aout are arbitrary secret
 * invertible GF(2) affine maps and P is a secret triangular permutation
 * with each coordinate's Boolean ANF degree <=2, every nonzero affine
 * input coset admits a nonconstant affine output parity flag. This
 * algorithm recovers such a flag and recursively halves the coset.
 *
 * Unlike the generic degree-D online oracle reduction, no new affine
 * coset truth-table evaluations are required. Maintain, for current
 * coset S=b+span(v0,...,v[d-1]):
 *
 *   f0     = F(b)
 *   delta[j] = F(b xor v[j]) xor F(b)
 *   polar[i][j] = F(b xor v[i] xor v[j])
 *                 xor F(b xor v[i]) xor F(b xor v[j]) xor F(b)
 *
 * For a global quadratic F, polar is independent of b and bilinear in
 * its directions. Find output parity w orthogonal to every polar pair
 * but nonconstant on some delta; a[j] = parity(w & delta[j]).
 * Let p be a pivot with a[p]=1 and c = parity(w & (target xor f0)).
 * Restrict to the affine half-space defined by that output flag:
 *
 *   b' = b xor (c ? v[p] : 0)
 *   v'[j] = v[j] xor (a[j] ? v[p] : 0), j != p
 *   f0' = f0 xor (c ? delta[p] : 0)
 *   delta'[j] = delta[j] xor (a[j] ? delta[p] : 0)
 *               xor ((a[j] xor c) ? polar[j][p] : 0)
 *   polar'[j][k] = polar[j][k] xor (a[j] ? polar[p][k] : 0)
 *                  xor (a[k] ? polar[j][p] : 0)
 *
 * The recurrences are exact over GF(2), including at width 32. After
 * n steps, compare the resulting candidate to the ORIGINAL target
 * using one local evaluation of the learned polynomial model.
 *
 * The public ANF model itself requires 1+n+C(n,2) prior chosen forward
 * queries to learn (529 for 32 bits). THIS EXISTING interpolation is
 * not this algorithm's contribution. The attack does NOT access any
 * original forward oracle after learning, needs no hidden matrices
 * and has no generic inversion claim for non-triangular quadratic maps.
 * A degree/premise violation cannot be excluded from 529 forward queries.
 *
 * @param {ReturnType<import('./bounded-degree-oracle-functional-clone').learnBoundedDegreeOracle>} model
 * @param {number} target
 * @returns {{input:number,linearSystemsSolved:number,localModelEvaluations:1,verifiedUnderPromise:true}|null}
 */
function invertQuadraticAffineTriangularModel(model,target) {
  const n=model.bits;
  if(!Number.isInteger(n)||n<2||n>32||model.degree!==2){
    throw new RangeError('Expected a complete 2..32-bit quadratic ANF model');
  }
  const mask=n===32?0xffffffff:(2**n-1)>>>0;
  if(!Number.isSafeInteger(target)||target<0||target>mask) {
    throw new RangeError('Target must be an unsigned word of declared width');
  }
  const expected=1+n+n*(n-1)/2;
  if(!Array.isArray(model.coefficients)||model.coefficients.length!==expected){
    throw new TypeError('Incomplete or nonquadratic Boolean ANF coefficient table');
  }
  /** @type {Map<number,number>} */
  const coefficients=new Map();
  for(const pair of model.coefficients) {
    const monomial=pair[0],value=pair[1];
    if(!Number.isSafeInteger(monomial)||monomial<0||monomial>mask||
       !Number.isSafeInteger(value)||value<0||value>mask||
       coefficients.has(monomial)){
      throw new TypeError('Invalid or duplicate coefficient in Boolean ANF model');
    }
    coefficients.set(monomial,value>>>0);
  }
  /** @param {number} monomial @returns {number} */
  function coefficient(monomial) {
    const value=coefficients.get(monomial>>>0);
    if(value===undefined)throw new TypeError('Missing required Boolean ANF coefficient');
    return value;
  }
  let base=0;
  let output=coefficient(0);
  let basis=Array.from({length:n},(_,i)=>(1<<i)>>>0);
  let delta=basis.map(value=>coefficient(value));
  /** @type {number[][]} */
  let polar=Array.from({length:n},()=>Array(n).fill(0));
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++) {
    polar[i][j]=polar[j][i]=coefficient((basis[i]^basis[j])>>>0);
  }
  let linearSystemsSolved=0;
  for(let dimension=n;dimension>0;dimension--) {
    /** @type {{mask:number,rhs:number}[]} */
    const homogeneous=[];
    for(let i=0;i<dimension;i++)for(let j=i+1;j<dimension;j++) {
      if(polar[i][j])homogeneous.push({mask:polar[i][j],rhs:0});
    }
    let outputMask=null;
    for(const derivative of delta) {
      linearSystemsSolved++;
      outputMask=solveLinear(
        [...homogeneous,{mask:derivative,rhs:1}],n
      );
      if(outputMask!==null)break;
    }
    if(outputMask===null)return null;
    const labels=delta.map(derivative=>parity(outputMask&derivative));
    const pivotIndex=labels.findIndex(Boolean);
    if(pivotIndex<0)throw new Error('No varying output flag');
    const direction=basis[pivotIndex];
    const pivotDelta=delta[pivotIndex];
    const targetLabel=parity(outputMask&(target^output));
    if(targetLabel){
      base=(base^direction)>>>0;
      output=(output^pivotDelta)>>>0;
    }

    const survivors=basis.map((_,j)=>j).filter(j=>j!==pivotIndex);
    const nextBasis=survivors.map(j=>
      (basis[j]^(labels[j]?direction:0))>>>0);
    const nextDelta=survivors.map(j=>
      (delta[j]^(labels[j]?pivotDelta:0)^
        ((labels[j]^targetLabel)?polar[j][pivotIndex]:0))>>>0);
    const nextPolar=survivors.map(j=>survivors.map(k=>
      (polar[j][k]^(labels[j]?polar[pivotIndex][k]:0)^
        (labels[k]?polar[j][pivotIndex]:0))>>>0));
    basis=nextBasis;
    delta=nextDelta;
    polar=nextPolar;
  }
  // No evaluation of the source oracle. One evaluation of the already
  // learned local clone provides a separate consistency assertion.
  if(output!==(target>>>0)||
     evaluateBoundedDegreeModel(model,base)!==(target>>>0))return null;
  return {
    input:base>>>0,linearSystemsSolved,
    localModelEvaluations:/** @type {1} */(1),
    verifiedUnderPromise:true
  };
}

module.exports={invertQuadraticAffineTriangularModel};
