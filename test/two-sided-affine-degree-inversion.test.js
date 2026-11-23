'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {invertBoundedDegree,parity}=require('../sims/two-sided-affine-degree-inversion');

/** @param {number} seed @returns {()=>number} */
function rng(seed) {
  let s=seed>>>0;
  return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return s>>>0;};
}
/** @param {number} n @returns {number} */
function wordMask(n){return n===32?0xffffffff:(2**n-1)>>>0;}
/** @param {number[]} columns @param {number} value @returns {number} */
function applyLinear(columns,value) {
  let output=0;
  for(let i=0;i<columns.length;i++)if((value>>>i)&1)output^=columns[i];
  return output>>>0;
}
/** @param {number} n @param {()=>number} next @returns {{columns:number[],bias:number}} */
function randomAffine(n,next) {
  const columns=Array.from({length:n},(_,i)=>(1<<i)>>>0);
  for(let i=0;i<12*n;i++) {
    const a=next()%n,b=next()%n;
    if(a===b)continue;
    if(next()&1)columns[a]=(columns[a]^columns[b])>>>0;
    else [columns[a],columns[b]]=[columns[b],columns[a]];
  }
  return {columns,bias:next()&wordMask(n)};
}
/**
 * Independently generated nonlinear triangular function, with each bit
 * y[i]=x[i] XOR a polynomial on lower x bits of degree <= degree.
 * The outer affine wrappers erase any visible native bit ordering.
 * @param {number} n
 * @param {()=>number} next
 * @param {number} degree
 * @returns {(x:number)=>number}
 */
function createOracle(n,next,degree) {
  const inner=randomAffine(n,next),outer=randomAffine(n,next);
  /** @type {{linear:number,pairs:[number,number][],triples:[number,number,number][]}[]} */
  const polynomials=[];
  for(let bit=0;bit<n;bit++) {
    const linear=next()&(bit===0?0:(2**bit-1)>>>0);
    /** @type {[number,number][]} */
    const pairs=[];
    /** @type {[number,number,number][]} */
    const triples=[];
    if(degree>=2&&bit>=2)for(let i=0;i<Math.min(6,bit*bit);i++) {
      const a=next()%bit,b=next()%bit;
      if(a!==b)pairs.push([a,b]);
    }
    if(degree>=3&&bit>=3)for(let i=0;i<Math.min(6,bit*bit);i++) {
      const a=next()%bit,b=next()%bit,c=next()%bit;
      if(a!==b&&a!==c&&b!==c)triples.push([a,b,c]);
    }
    polynomials.push({linear,pairs,triples});
  }
  return value=>{
    const x=(applyLinear(inner.columns,value)^inner.bias)>>>0;
    let y=x;
    for(let bit=0;bit<n;bit++) {
      const polynomial=polynomials[bit];
      let change=parity(x&polynomial.linear);
      for(const [a,b] of polynomial.pairs)change^=((x>>>a)&1)&((x>>>b)&1);
      for(const [a,b,c] of polynomial.triples) {
        change^=((x>>>a)&1)&((x>>>b)&1)&((x>>>c)&1);
      }
      if(change)y^=1<<bit;
    }
    return (applyLinear(outer.columns,y)^outer.bias)>>>0;
  };
}
/** @param {number} n @param {number} d @returns {number} */
function theoreticalMax(n,d) {
  /** @param {number} a @param {number} b @returns {number} */
  function choose(a,b) {
    let product=1;
    for(let i=1;i<=b;i++)product=product*(a-i+1)/i;
    return Math.round(product);
  }
  let total=-1;
  for(let j=0;j<=d;j++)total+=choose(n+1,j+1);
  return total;
}

test('bounded-degree two-sided affine sandwich: every width-8 target and random 16/24/32-bit targets',()=>{
  for(const [n,d,sources] of [[8,2,10],[8,3,10],[16,2,50],[24,2,50],[32,2,50],[20,3,20]]) {
    let nonlinearSources=0;
    for(let trial=0;trial<sources;trial++) {
      const next=rng((0x33bead00^n^d^Math.imul(trial+1,0x9e3779b9))>>>0);
      const F=createOracle(n,next,d);
      // The fixture must not silently reduce to an affine map.
      let nonzero=false;
      for(let i=0;i<n&&!nonzero;i++)for(let j=i+1;j<n;j++) {
        if((F(0)^F(1<<i)^F(1<<j)^F((1<<i)^(1<<j)))!==0)nonzero=true;
      }
      if(nonzero)nonlinearSources++;
      const inputs=n===8?Array.from({length:256},(_,i)=>i):
        [(next()&wordMask(n))>>>0];
      for(const input of inputs) {
        const target=F(input);
        const result=invertBoundedDegree(F,target,n,d);
        assert.equal(result?.input,input,
          'Target inversion at width '+n+', degree '+d+', trial '+trial);
        assert.ok(result.queries<=theoreticalMax(n,d));
        assert.equal(result.dimensionCounts.length,n);
      }
    }
    assert.equal(nonlinearSources,sources,'Every tested family must be genuinely nonlinear');
  }
});

test('degree-width oracle inverse handles every compatible 3-bit truth table',()=>{
  // Exactly 2*4*16=128 compatible triangular permutations on three bits,
  // crossed with 10 independently seeded pairs of invertible affine wrappers.
  for(let low=0;low<2;low++)for(let middle=0;middle<4;middle++)
    for(let high=0;high<16;high++) {
      const code=low|(middle<<1)|(high<<3);
      for(let variant=0;variant<10;variant++) {
        const next=rng((0x4ddbb27^Math.imul(code+1,0x9e3779b9)^variant)>>>0);
        const inner=randomAffine(3,next),outer=randomAffine(3,next);
        const F=value=>{
          const x=(applyLinear(inner.columns,value)^inner.bias)&7;
          const y=x ^ (low&1) ^
            (((middle>>>(x&1))&1)<<1) ^
            (((high>>>(x&3))&1)<<2);
          return (applyLinear(outer.columns,y)^outer.bias)&7;
        };
        for(let x=0;x<8;x++) {
          const result=invertBoundedDegree(F,F(x),3,3);
          assert.equal(result?.input,x,'Compatible truth table '+code+' variant '+variant);
        }
      }
    }
});

test('sparse high-degree compatible transposition is a declared-degree counterexample',()=>{
  // This swaps just two inputs with equal lower n-1 bits, so it remains
  // compatible/triangular, but the hidden MSB toggle has algebraic degree
  // n-1. A falsely supplied degree=2 promise must not be called a theorem.
  for(const n of [16,24,32]) {
    const next=rng((0x33333^n)>>>0),outer=randomAffine(n,next);
    const high=(1<<(n-1))>>>0;
    const low=(0x6badcafe&((2**(n-1)-1)>>>0))>>>0;
    const swapped=(low^high)>>>0;
    const F=x=>{
      const y=x===low?swapped:x===swapped?low:x;
      return (applyLinear(outer.columns,y)^outer.bias)>>>0;
    };
    const result=invertBoundedDegree(F,F(swapped),n,2);
    assert.equal(result,null,'Bounded-degree promise is necessary at width '+n);
  }
});

test('rejects unsupported oracle, width, degree and budget',()=>{
  const F=x=>x;
  for(const args of [[F,0,0,1],[F,0,33,1],[F,0,8,0],[F,0,8,9],[F,0,8,2,0]]) {
    assert.throws(()=>invertBoundedDegree(...args),/Expected forward oracle/);
  }
  assert.throws(()=>invertBoundedDegree(F,0,8,2,1),/query budget/);
});
