'use strict';

/**
 * Oracle-only target inversion for bounded-degree affine sandwiches of
 * triangular (compatible) GF(2) permutations. All bit masks are unsigned
 * 32-bit words, supporting 1 <= width <= 32.
 *
 * This is an ATTACK tool, not a compiler transform or source-secrecy claim.
 * The declared degree bound is an external promise; a forward oracle cannot
 * efficiently certify it using this query budget alone.
 */

const {learnBoundedDegreeOracle,evaluateBoundedDegreeModel} =
  require('./bounded-degree-oracle-functional-clone');

/** @param {number} x @returns {number} */
function parity(x) {
  x >>>= 0;
  x ^= x >>> 16; x ^= x >>> 8; x ^= x >>> 4; x &= 15;
  return (0x6996 >>> x) & 1;
}

/**
 * Solve binary linear equations via leftmost-pivot row elimination.
 * @param {{mask:number,rhs:number}[]} equations
 * @param {number} width
 * @returns {number|null}
 */
function solveLinear(equations,width) {
  /** @type {({mask:number,rhs:number}|null)[]} */
  const pivots=Array(width).fill(null);
  for(const equation of equations) {
    let mask=equation.mask>>>0, rhs=equation.rhs;
    for(let bit=0;bit<width&&mask;bit++) {
      if(!((mask>>>bit)&1))continue;
      const row=pivots[bit];
      if(row){mask=(mask^row.mask)>>>0;rhs^=row.rhs;}
      else {pivots[bit]={mask,rhs};break;}
    }
    if(mask===0&&rhs)return null;
  }
  let solution=0;
  for(let bit=width-1;bit>=0;bit--) {
    const row=pivots[bit];
    if(!row)continue;
    const higher=(row.mask&(~((2**(bit+1))-1)))>>>0;
    if(row.rhs^parity(higher&solution))solution^=(1<<bit);
  }
  solution>>>=0;
  if(equations.some(row=>parity(row.mask&solution)!==row.rhs)){
    throw new Error('Inconsistent row reduction');
  }
  return solution;
}

/**
 * Deterministically invert target under the promise:
 *
 * F = A_out o P o A_in,
 *
 * where A_in/A_out are invertible affine maps over GF(2)^width,
 * and each output coordinate of triangular permutation P has Boolean
 * algebraic degree <= degree. Neither affine map, P, nor its hidden
 * coordinate order is provided to the attacker.
 *
 * Queries only the forward oracle. At dimension d, all coefficient
 * vectors of ANF monomials of orders 2..degree are computed exactly by
 * Mobius inversion on subsets of at most degree affine basis directions.
 * An output parity annihilating those coefficients, and nonconstant on
 * the coset, cuts its dimension by one without excluding the target.
 *
 * Upper bound on distinct oracle queries:
 *   sum(d=1..width) sum(j=0..min(degree,d)) choose(d,j)
 * = sum(j=0..degree) choose(width+1,j+1) - 1.
 * This is O(width^(degree+1)) for constant degree, exponential when
 * degree grows with width. It is not a polynomial-time arbitrary-JS
 * inversion method.
 *
 * @param {(input:number)=>number} oracle An n-bit forward permutation oracle
 * @param {number} target Output to invert
 * @param {number} width Integer in [1,32]
 * @param {number} degree Claimed maximum ANF degree in [1,width]
 * @param {number} [queryBudget] Maximum distinct oracle queries
 * @returns {{input:number,queries:number,dimensionCounts:number[]}|null}
 */
function invertBoundedDegree(oracle,target,width,degree,queryBudget=300000) {
  if(typeof oracle!=='function'||!Number.isInteger(width)||width<1||
      width>32||!Number.isInteger(degree)||degree<1||degree>width||
      !Number.isSafeInteger(queryBudget)||queryBudget<1) {
    throw new RangeError('Expected forward oracle, width, degree and positive budget');
  }
  const mask=width===32?0xffffffff:(2**width-1)>>>0;
  const cache=new Map();
  /** @param {number} input @returns {number} */
  function F(input) {
    const key=(input&mask)>>>0;
    if(cache.has(key))return /** @type {number} */ (cache.get(key));
    if(cache.size>=queryBudget)throw new RangeError('Oracle query budget exhausted');
    const value=(oracle(key)&mask)>>>0;
    cache.set(key,value);
    return value;
  }

  let base=0;
  let basis=Array.from({length:width},(_,i)=>(1<<i)>>>0);
  /** @type {number[]} */
  const dimensionCounts=[];
  for(let dimension=width;dimension>0;dimension--) {
    const before=cache.size;
    /** @type {{subset:number,value:number}[]} */
    const samples=[{subset:0,value:F(base)}];

    /**
     * Enumerate exactly the basis subsets of a prescribed Hamming weight.
     * @param {number} first
     * @param {number} remaining
     * @param {number} subset
     * @param {number} offset
     * @returns {void}
     */
    function visit(first,remaining,subset,offset) {
      if(!remaining) {
        samples.push({subset,value:F(base^offset)});
        return;
      }
      for(let j=first;j<=dimension-remaining;j++) {
        visit(j+1,remaining-1,(subset^(1<<j))>>>0,(offset^basis[j])>>>0);
      }
    }
    for(let size=1;size<=Math.min(dimension,degree);size++)visit(0,size,0,0);

    const table=new Map(samples.map(sample=>[sample.subset,sample.value]));
    const origin=/** @type {number} */(table.get(0));
    const differences=basis.map((_,j)=>
      (/** @type {number} */ (table.get((1<<j)>>>0))^origin)>>>0);

    /** @type {{mask:number,rhs:number}[]} */
    const homogeneous=[];
    for(const sample of samples) {
      const bits=sample.subset;
      if(bits===0||(bits&(bits-1))===0)continue;
      // The vector-valued ANF coefficient at monomial U is
      // XOR of the 2^|U| outputs at all its submasks.
      let coefficient=0,submask=bits;
      for(;;) {
        coefficient^=/** @type {number} */ (table.get(submask));
        if(!submask)break;
        submask=(submask-1)&bits;
      }
      if(coefficient)homogeneous.push({mask:coefficient>>>0,rhs:0});
    }

    let functional=null;
    for(const difference of differences) {
      functional=solveLinear([...homogeneous,{mask:difference,rhs:1}],width);
      if(functional!==null)break;
    }
    if(functional===null)return null;

    const coefficients=differences.map(delta=>parity(functional&delta));
    const pivotIndex=coefficients.findIndex(Boolean);
    if(pivotIndex<0)throw new Error('No varying output bit');
    const targetBit=parity(functional&target)^parity(functional&origin);
    const pivot=basis[pivotIndex];
    if(targetBit)base=(base^pivot)>>>0;

    basis=basis.filter((_,j)=>j!==pivotIndex).map((other,j)=>{
      const originalIndex=j<pivotIndex?j:j+1;
      return (other^(coefficients[originalIndex]?pivot:0))>>>0;
    });
    dimensionCounts.push(cache.size-before);
  }
  if(F(base)!==((target&mask)>>>0))return null;
  return {input:base>>>0,queries:cache.size,dimensionCounts};
}


/**
 * Stronger query-accounting variant: interpolate the entire degree-D forward
 * map ONCE using the existing generic ANF learning tool. All subsequent
 * affine-coset reductions run on that offline clone, never on the real oracle.
 *
 * The exact external training count is sum(j=0..D) choose(width,j):
 * 529 at width=32,D=2 and 5489 at width=32,D=3.
 * This cloning bound is already known in this repository; this wrapper adds
 * polynomial-time inversion under the further triangular-affine promise.
 *
 * No post-learning oracle is available for confirmation. Returned inverse
 * candidates are exact ONLY under the stated degree/permutation promise;
 * callers with a live oracle should independently compare F(input) to target.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} width
 * @param {number} degree Supported existing interpolation degree 1..4
 * @returns {{trainingQueries:number,invert:(target:number)=>{input:number,localEvaluations:number}|null}}
 */
function trainBoundedDegreeInverse(oracle,width,degree) {
  const model=learnBoundedDegreeOracle(oracle,width,degree);
  return {
    trainingQueries:model.queryCount,
    /** @param {number} target @returns {{input:number,localEvaluations:number}|null} */
    invert(target) {
      const candidate=invertBoundedDegree(
        input=>evaluateBoundedDegreeModel(model,input),
        target,width,degree
      );
      if(!candidate)return null;
      return {input:candidate.input,localEvaluations:candidate.queries};
    }
  };
}

module.exports={invertBoundedDegree,trainBoundedDegreeInverse,parity,solveLinear};
