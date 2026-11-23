'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {invertBoundedDegree,trainBoundedDegreeInverse,parity}=
  require('../sims/two-sided-affine-degree-inversion');
const {learnBoundedDegreeOracle}=
  require('../sims/bounded-degree-oracle-functional-clone');
const {invertQuadraticAffineTriangularModel}=
  require('../sims/quadratic-affine-triangular-inverse');
const {makeDenseOracle,makeSparseWitness,makeUnstructuredOracle}=
  require('../sims/affine-flag-oracle-fixtures');

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
  return (/** @type {(value:number)=>number} */ (value=>{
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
  }));
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
        assert.ok(result,'Expected an exact inverse for the declared degree bound');
        assert.equal(result.input,input,
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
        /** @param {number} value @returns {number} */
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
    /** @param {number} x @returns {number} */
    const F=x=>{
      const y=x===low?swapped:x===swapped?low:x;
      return (applyLinear(outer.columns,y)^outer.bias)>>>0;
    };
    const result=invertBoundedDegree(F,F(swapped),n,2);
    assert.equal(result,null,'Bounded-degree promise is necessary at width '+n);
  }
});


test('existing degree-D ANF interpolation supports offline inverse after 529 online calls at width 32',()=>{
  for(let source=0;source<3;source++) {
    const n=32,d=2;
    const next=rng((0x98ce197^Math.imul(source+1,0x9e3779b9))>>>0);
    const F=createOracle(n,next,d);
    let realCalls=0;
    const model=trainBoundedDegreeInverse(input=>{
      realCalls++;
      return F(input);
    },n,d);
    assert.equal(model.trainingQueries,529);
    assert.equal(realCalls,529);
    for(let targetIndex=0;targetIndex<12;targetIndex++) {
      const secret=(next()&wordMask(n))>>>0;
      const requested=F(secret); // independent evaluator, never passed to learning wrapper
      const inverted=model.invert(requested);
      assert.equal(inverted?.input,secret,
        'Offline inversion must recover the secret with all matrices unknown');
      assert.ok(inverted);
      assert.ok(inverted.localEvaluations<=theoreticalMax(n,d));
      assert.equal(realCalls,529,'After training, the attacker gets no additional oracle data');
    }
  }
});


test('independent prior source families: dense compatibility, rare gate, noncompatible refusal',()=>{
  // This fixture was written for the older sampled-flag attacker, not our
  // ANF-certificate implementation. Width 7 allows a COMPLETE degree-7
  // certificate for every affine-wrapped triangular function in the fixture.
  for(let seed=1;seed<=6;seed++){
    const source=makeDenseOracle(7,Math.imul(seed+7,0x9e3779b9));
    for(let secret=0;secret<128;secret++) {
      const result=invertBoundedDegree(source.evaluate,source.evaluate(secret),7,7);
      assert.equal(result?.input,secret);
    }
  }
  // Reuse the intentionally pathological high-degree sparse fixture that
  // defeats the sampled-flag heuristic. With the TRUE degree promise,
  // exhaustive high-order ANF coefficients restore the exact guarantee.
  const rare=makeSparseWitness();
  const correct=invertBoundedDegree(rare.evaluate,rare.evaluate(rare.secret),11,11);
  assert.equal(correct?.input,rare.secret);
  // All arbitrary width-8 permutations have degree <=8, but typically lack
  // the affine flag forced by hidden triangular compatibility. Degree alone
  // is not a replacement for the structural assumption.
  let refused=0;
  for(let seed=1;seed<=6;seed++) {
    const random=makeUnstructuredOracle(8,Math.imul(seed,0x9e3779b9));
    const result=invertBoundedDegree(random,random(1),8,8);
    if(result===null)refused++;
  }
  assert.ok(refused>=5,'A random noncompatible source should lack an affine flag');
});

test('offline polynomial cloning also supports an independent degree-three wrapped source',()=>{
  const n=20,d=3;
  const next=rng(0x42b1ce37);
  const F=createOracle(n,next,d);
  let online=0;
  const trained=trainBoundedDegreeInverse(input=>{online++;return F(input);},n,d);
  assert.equal(trained.trainingQueries,1351); // 1 + 20 + 190 + 1140
  for(let t=0;t<4;t++){
    const original=(next()&wordMask(n))>>>0;
    const recovered=trained.invert(F(original));
    assert.equal(recovered?.input,original);
    assert.equal(online,1351,'All inverse work remains in the learned offline model');
  }
});


test('quadratic polar transport needs exactly one local model evaluation per offline inverse',()=>{
  let observed=0,queries=0,fastModelEvaluations=0,oldModelEvaluations=0;
  for(const [n,seeds,perSource] of [[8,20,256],[16,25,25],[24,25,25],[32,25,25]]) {
    for(let seed=0;seed<seeds;seed++) {
      const next=rng((0xed10a1bf^n^Math.imul(seed+1,0x9e3779b9))>>>0);
      const F=createOracle(n,next,2);
      let online=0;
      const model=learnBoundedDegreeOracle(input=>{online++;return F(input);},n,2);
      const expected=1+n+n*(n-1)/2;
      assert.equal(online,expected,'Exactly M(n,2) original query calls');
      queries+=online;
      for(let targetId=0;targetId<perSource;targetId++) {
        const input=n===8?targetId:(next()&wordMask(n))>>>0;
        const requested=F(input);
        const fast=invertQuadraticAffineTriangularModel(model,requested);
        assert.equal(fast?.input,input,'Polar transport must invert hidden affine sandwich');
        assert.equal(fast?.localModelEvaluations,1);
        assert.ok(fast&&fast.linearSystemsSolved>=n);
        fastModelEvaluations+=fast.localModelEvaluations;
        if(targetId===0) {
          // Compare to independently implemented subset-Mobius method.
          const old=invertBoundedDegree(
            x=>{
              let value=0;
              for(const [mask,coefficient] of model.coefficients) {
                if(((x&mask)>>>0)===mask)value^=coefficient;
              }
              return value>>>0;
            },requested,n,2
          );
          assert.equal(old?.input,input);
          assert.ok(old);
          oldModelEvaluations+=old.queries;
        }
        assert.equal(online,expected,'Inversion must not call protected online oracle');
        observed++;
      }
    }
  }
  assert.equal(fastModelEvaluations,observed);
  assert.ok(oldModelEvaluations>fastModelEvaluations);
  console.log('QUADRATIC_POLAR_TRANSPORT '+JSON.stringify({
    sources:95,preimages:observed,onlineQueries:queries,
    localPolynomialEvaluations:fastModelEvaluations,
    oldOnlineAlgorithmSampledLocalEvaluations:oldModelEvaluations
  }));
});

test('quadratic affine-coset inversion refuses nonpermutations and malformed models',()=>{
  const model=learnBoundedDegreeOracle(input=>((input&3)===3?1:0),8,2);
  assert.equal(invertQuadraticAffineTriangularModel(model,1),null);
  assert.throws(
    ()=>invertQuadraticAffineTriangularModel({...model,degree:3},1),
    /quadratic ANF model/
  );
  assert.throws(
    ()=>invertQuadraticAffineTriangularModel(model,256),
    /unsigned word/
  );
  const duplicate={
    ...model,coefficients:model.coefficients.map(([mask,value],i)=>
      /** @type {[number,number]} */([i===1?0:mask,value]))
  };
  assert.throws(()=>invertQuadraticAffineTriangularModel(duplicate,0),/duplicate/);
});

test('false quadratic degree premise can yield a wrong source preimage after honest offline model check',()=>{
  const bits=8,gateBit=7,prefix=127,hi=(1<<gateBit);
  /** @param {number} input @returns {number} */
  const actual=input=>
    ((input&127)===prefix?input^hi:input)>>>0;
  const model=learnBoundedDegreeOracle(actual,bits,2);
  const target=actual(255);
  const recovered=invertQuadraticAffineTriangularModel(model,target);
  assert.equal(recovered?.input,127,
    'A low-weight source-model learner cannot detect an unseen rare gate');
  assert.notEqual(actual(recovered.input),target,
    'Source oracle equality MUST be checked before any unconditional claim');
});

test('rejects unsupported oracle, width, degree and budget',()=>{
  /** @param {number} x @returns {number} */
  const F=x=>x;
  assert.throws(()=>invertBoundedDegree(F,0,0,1),/Expected forward oracle/);
  assert.throws(()=>invertBoundedDegree(F,0,33,1),/Expected forward oracle/);
  assert.throws(()=>invertBoundedDegree(F,0,8,0),/Expected forward oracle/);
  assert.throws(()=>invertBoundedDegree(F,0,8,9),/Expected forward oracle/);
  assert.throws(()=>invertBoundedDegree(F,0,8,2,0),/Expected forward oracle/);
  assert.throws(()=>invertBoundedDegree(F,0,8,2,1),/query budget/);
  assert.throws(()=>invertBoundedDegree(F,-1,8,2),/unsigned word/);
  assert.throws(()=>invertBoundedDegree(F,256,8,2),/unsigned word/);
  assert.throws(()=>invertBoundedDegree(()=>-1,0,8,2),/Forward oracle must return/);
  assert.throws(()=>invertBoundedDegree(()=>256,0,8,2),/Forward oracle must return/);
});
