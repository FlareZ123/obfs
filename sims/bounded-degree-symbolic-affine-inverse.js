'use strict';

const {parity,solveLinear}=require('./two-sided-affine-degree-inversion');
const {evaluateBoundedDegreeModel}=
  require('./bounded-degree-oracle-functional-clone');

/** @param {number} word @returns {number} */
function popcount(word) {
  let count=0;
  word>>>=0;
  while(word){word&=word-1;count++;}
  return count;
}

/**
 * Remove variable coordinate pivot from a compact unsigned bitmask.
 * Handles the n=32, pivot=31 corner without JavaScript shift wraparound.
 *
 * @param {number} mask
 * @param {number} pivot
 * @returns {number}
 */
function dropCoordinate(mask,pivot) {
  const lower=(mask&(2**pivot-1))>>>0;
  const higher=pivot===31?0:mask>>>(pivot+1);
  return (lower|(higher<<pivot))>>>0;
}

/** @param {number} n @param {number} d @returns {number} */
function coefficientCount(n,d) {
  let count=0,choose=1;
  for(let k=0;k<=d;k++) {
    if(k>0)choose=choose*(n-k+1)/k;
    count+=Math.round(choose);
  }
  return count;
}

/**
 * Symbolic quadratic/cubic/quartic target inversion under the promise:
 *
 * F = Aout ∘ P ∘ Ain : GF(2)^n -> GF(2)^n
 *
 * where hidden affine Aout/Ain are invertible and P is a triangular
 * permutation, P_i(z) = z_i xor h_i(z_0,...,z_{i-1}).
 * The exact public vector ANF model has degree <= d, 1 <= d <= 4,
 * and was independently learned using sum(k=0..d) C(n,k) forward queries.
 *
 * An output parity w exists that is affine nonconstant on any nonempty
 * affine input coset, because the least varying hidden triangular input
 * coordinate is affine on that coset. Exact restricted ANF coefficients
 * reveal w as a GF(2) linear equation solution, without sampling error.
 *
 * Key optimization: the entire coefficient table for an affine subcoset
 * is maintained SYMBOLICALLY, so no repeated evaluations of the trained
 * polynomial are needed. At each dimension, find affine parity w with
 * a_j=parity(w & C_{x_j}), pivot p with a_p=1, and
 * c=parity(w & (target xor C_0)).
 *
 * Restrict old coordinates x_p to c xor sum_{j != p} a_j u_j, with
 * x_j=u_j for j != p. The new basis v'_j=v_j xor a_j v_p and origin
 * b'=b xor c*v_p preserve the target preimage. For every old nonzero
 * monomial coefficient C_S:
 *  - if p∉S: add C_S to new monomial S\{p};
 *  - if p∈S: if c, add C_S to S\{p}; for every j!=p with a_j,
 *    add C_S to (S\{p})∪{j}, collapsing x_j^2=x_j.
 * All additions use XOR. Degree remains <=d, coefficients are exact.
 *
 * Repeating n times leaves a single input. One local evaluation of the
 * model checks the result; no ORIGINAL oracle is invoked after training.
 * An invalid degree promise can produce the wrong source preimage, since
 * low-weight observations do not certify missing high-degree terms.
 *
 * @param {ReturnType<import('./bounded-degree-oracle-functional-clone').learnBoundedDegreeOracle>} model
 * @param {number} target
 * @returns {{input:number,linearSystemsSolved:number,coefficientXorUpdates:number,localModelEvaluations:1}|null}
 */
function invertBoundedDegreeModelSymbolically(model,target) {
  const n=model.bits,d=model.degree;
  if(!Number.isInteger(n)||n<1||n>32||
     !Number.isInteger(d)||d<1||d>Math.min(n,4)){
    throw new RangeError('Expected a 1..32-bit complete ANF model of degree 1..4');
  }
  const mask=n===32?0xffffffff:(2**n-1)>>>0;
  if(!Number.isSafeInteger(target)||target<0||target>mask){
    throw new RangeError('Target must be an unsigned word of declared width');
  }
  if(!Array.isArray(model.coefficients)||
     model.coefficients.length!==coefficientCount(n,d)){
    throw new TypeError('Incomplete bounded-degree Boolean ANF coefficient table');
  }
  /** @type {Map<number,number>} */
  let coefficients=new Map();
  /** @type {Set<number>} */
  const seen=new Set();
  for(const pair of model.coefficients) {
    const monomial=pair[0],value=pair[1];
    if(!Number.isSafeInteger(monomial)||monomial<0||monomial>mask||
       !Number.isSafeInteger(value)||value<0||value>mask||
       popcount(monomial)>d||seen.has(monomial)){
      throw new TypeError('Invalid or duplicate Boolean ANF coefficient');
    }
    seen.add(monomial);
    if(value)coefficients.set(monomial,value>>>0);
  }
  let base=0,linearSystemsSolved=0,coefficientXorUpdates=0;
  let basis=Array.from({length:n},(_,i)=>(1<<i)>>>0);
  for(let dimension=n;dimension>0;dimension--) {
    /** @type {{mask:number,rhs:number}[]} */
    const homogeneous=[];
    for(const [monomial,value] of coefficients) {
      if((monomial&(monomial-1))!==0)
        homogeneous.push({mask:value,rhs:0});
    }
    const delta=basis.map((_,index)=>coefficients.get((1<<index)>>>0)??0);
    let outputMask=null;
    for(const derivative of delta) {
      linearSystemsSolved++;
      outputMask=solveLinear(
        [...homogeneous,{mask:derivative,rhs:1}],n
      );
      if(outputMask!==null)break;
    }
    if(outputMask===null)return null;
    const a=delta.map(value=>parity(value&outputMask));
    const pivotIndex=a.findIndex(Boolean);
    if(pivotIndex<0)throw new Error('No nonconstant output parity');
    const c=parity(outputMask&(target^(coefficients.get(0)??0)));
    const pivotBasis=basis[pivotIndex];
    if(c)base=(base^pivotBasis)>>>0;
    const survivors=basis.map((_,index)=>index).filter(index=>index!==pivotIndex);
    basis=survivors.map(index=>
      (basis[index]^(a[index]?pivotBasis:0))>>>0);

    const pivotBit=(1<<pivotIndex)>>>0;
    const activeSubstitutions=survivors.filter(index=>a[index])
      .map(index=>dropCoordinate((1<<index)>>>0,pivotIndex));
    /** @type {Map<number,number>} */
    const next=new Map();
    /** @param {number} monomial @param {number} value @returns {void} */
    function xorCoefficient(monomial,value) {
      if(!value)return;
      coefficientXorUpdates++;
      const combined=((next.get(monomial)??0)^value)>>>0;
      if(combined)next.set(monomial,combined);
      else next.delete(monomial);
    }
    for(const [oldMask,value] of coefficients) {
      const newMask=dropCoordinate(oldMask,pivotIndex);
      if(!(oldMask&pivotBit)) {
        xorCoefficient(newMask,value);
        continue;
      }
      if(c)xorCoefficient(newMask,value);
      for(const substitution of activeSubstitutions) {
        xorCoefficient((newMask|substitution)>>>0,value);
      }
    }
    coefficients=next;
  }
  if((coefficients.get(0)??0)!==(target>>>0)||
     evaluateBoundedDegreeModel(model,base)!==(target>>>0))return null;
  return {
    input:base>>>0,linearSystemsSolved,coefficientXorUpdates,
    localModelEvaluations:/** @type {1} */(1)
  };
}

module.exports={invertBoundedDegreeModelSymbolically,coefficientCount,dropCoordinate};
