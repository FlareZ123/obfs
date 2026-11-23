'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {learnBoundedDegreeOracle}=require('../sims/bounded-degree-oracle-functional-clone');
const {invertBoundedDegreeModelSymbolically,dropCoordinate,coefficientCount}=
  require('../sims/bounded-degree-symbolic-affine-inverse');
const {invertQuadraticAffineTriangularModel}=
  require('../sims/quadratic-affine-triangular-inverse');

/** @param {number} seed @returns {()=>number} */
function rng(seed) {
  let x=seed>>>0;
  return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;};
}
/** @param {number} bits @returns {number} */
function wordMask(bits) {
  return bits===32?0xffffffff:(2**bits-1)>>>0;
}
/** @param {number[]} columns @param {number} word @returns {number} */
function multiply(columns,word) {
  let result=0;
  for(let bit=0;bit<columns.length;bit++) {
    if((word>>>bit)&1)result^=columns[bit];
  }
  return result>>>0;
}
/** @param {number} bits @param {()=>number} next @returns {{columns:number[],bias:number}} */
function affine(bits,next) {
  const columns=Array.from({length:bits},(_,i)=>(1<<i)>>>0);
  for(let i=0;i<12*bits;i++) {
    const a=next()%bits,b=next()%bits;
    if(a===b)continue;
    if(next()&1)columns[a]=(columns[a]^columns[b])>>>0;
    else [columns[a],columns[b]]=[columns[b],columns[a]];
  }
  return {columns,bias:next()&wordMask(bits)};
}
/**
 * Build independently generated invertible Boolean polynomial source.
 * Adds a forced highest-degree term in the last hidden output bit,
 * making the tested degree an actual degree rather than a loose bound.
 * @param {number} bits
 * @param {number} degree
 * @param {()=>number} next
 * @returns {(input:number)=>number}
 */
function makeSource(bits,degree,next) {
  const inside=affine(bits,next),outside=affine(bits,next);
  /** @type {{bias:number,terms:number[][]}[]} */
  const components=[];
  for(let bit=0;bit<bits;bit++) {
    /** @type {number[][]} */
    const terms=[];
    if(bit>0) {
      terms.push([next()%bit]);
      for(let k=2;k<=degree&&k<=bit;k++) {
        for(let j=0;j<Math.min(4,bit);j++) {
          const chosen=new Set();
          while(chosen.size<k)chosen.add(next()%bit);
          terms.push([...chosen].sort((a,b)=>a-b));
        }
      }
    }
    // Guarantee the maximum-degree monomial survives by adding it
    // exactly once and excluding duplicates of it.
    if(bit===bits-1&&degree>1) {
      const forced=Array.from({length:degree},(_,i)=>i);
      const signature=forced.join(',');
      const without=terms.filter(t=>t.join(',')!==signature);
      terms.length=0;terms.push(...without,forced);
    }
    components.push({bias:next()&1,terms});
  }
  return input=>{
    const x=(multiply(inside.columns,input)^inside.bias)>>>0;
    let y=x;
    for(let bit=0;bit<bits;bit++) {
      const component=components[bit];
      let value=component.bias;
      for(const term of component.terms) {
        let product=1;
        for(const index of term)product&=(x>>>index)&1;
        value^=product;
      }
      if(value)y=(y^(1<<bit))>>>0;
    }
    return (multiply(outside.columns,y)^outside.bias)>>>0;
  };
}
/** @param {number} value @returns {number} */
function popcount(value){
  let n=0;
  while(value){value&=value-1;n++;}
  return n;
}

test('compact GF2 coordinate deletion handles all 32 possible high-bit pivots',()=>{
  for(let pivot=0;pivot<32;pivot++)for(let bit=0;bit<32;bit++) {
    const raw=(1<<bit)>>>0;
    const expected=bit<pivot?raw:bit===pivot?0:(1<<(bit-1))>>>0;
    assert.equal(dropCoordinate(raw,pivot),expected,
      'Unsigned deletion at pivot '+pivot+', bit '+bit);
  }
  assert.equal(coefficientCount(32,2),529);
  assert.equal(coefficientCount(32,3),5489);
  assert.equal(coefficientCount(20,4),6196);
});

test('symbolic ANF transport exactly inverts independently randomized affine-sandwiched degrees 1..4',()=>{
  /** @type {[number,number,number,number][]} */
  const groups=[
    [8,1,10,256],[16,1,10,12],[32,1,10,12],
    [8,2,10,256],[16,2,10,12],[24,2,10,12],[32,2,10,12],
    [8,3,10,256],[16,3,8,8],[24,3,6,5],[32,3,4,6],
    [8,4,10,256],[16,4,8,5],[20,4,5,4],[32,4,2,3]
  ];
  let models=0,targets=0,trainingQueries=0,modelEvaluations=0;
  for(const [bits,degree,seeds,requests] of groups) {
    for(let seed=0;seed<seeds;seed++) {
      const next=rng((0xe471d00d^bits^degree^Math.imul(seed+1,0x9e3779b9))>>>0);
      const F=makeSource(bits,degree,next);
      let realCalls=0;
      const model=learnBoundedDegreeOracle(x=>{realCalls++;return F(x);},bits,degree);
      assert.equal(realCalls,coefficientCount(bits,degree));
      if(degree>=2) {
        assert.ok(model.coefficients.some(([monomial,value])=>
          popcount(monomial)===degree&&value!==0),
          'The source must have actual rather than nominal degree '+degree);
      }
      models++;trainingQueries+=realCalls;
      for(let index=0;index<requests;index++) {
        const secret=bits===8?index:(next()&wordMask(bits))>>>0;
        const target=F(secret);
        const found=invertBoundedDegreeModelSymbolically(model,target);
        assert.equal(found?.input,secret,
          'ANF transport width '+bits+', degree '+degree+', seed '+seed);
        assert.equal(found?.localModelEvaluations,1);
        assert.ok(found&&found.linearSystemsSolved>=bits);
        if(degree===2&&index===0) {
          const polar=invertQuadraticAffineTriangularModel(model,target);
          assert.equal(polar?.input,secret,
            'Degree-two coefficient transport and independent polar recurrence disagree');
        }
        assert.equal(realCalls,coefficientCount(bits,degree),
          'Offline ANF inverse must never query the original oracle');
        modelEvaluations++;
        targets++;
      }
    }
  }
  assert.equal(models,123);
  assert.equal(modelEvaluations,targets);
  console.log('BOUNDED_DEGREE_SYMBOLIC_AFFINE_INVERSE '+JSON.stringify({
    models,targets,trainingQueries,finalModelEvaluations:modelEvaluations
  }));
});


test('two-round quadratic Feistel is degree-four and invertible yet lacks a global affine output flag',()=>{
  // A deliberately *non*-triangular-affine target under the identical
  // degree-four promise: two nonlinear Feistel rounds on 4+4 bit halves.
  // The vector-valued nonlinear ANF has full output rank eight, therefore
  // no nonconstant output parity can be affine on the *whole* input space.
  // This demonstrates why low algebraic degree + bijectivity alone is not
  // sufficient for the hidden-single-round triangular inversion theorem.
  const pairs=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
  const g=[[4,0,3,1],[0,5,1,2],[4,3,2,1],[0,2,3,5]];
  const h=[[5,3,0,4],[4,5,2,3],[4,0,3,1],[0,2,3,1]];
  /** @param {number} word @param {number[][]} controls @returns {number} */
  function nonlinear(word,controls) {
    let transformed=0;
    for(let bit=0;bit<4;bit++) {
      let value=0;
      for(const index of controls[bit]) {
        const pair=pairs[index];
        value^=((word>>>pair[0])&1)&((word>>>pair[1])&1);
      }
      transformed^=value<<bit;
    }
    return transformed;
  }
  /** @param {number} x @returns {number} */
  function F(x) {
    const low=x&15, high=(x>>>4)&15;
    const middle=(high^nonlinear(low,g))&15;
    const finalHigh=(low^nonlinear(middle,h))&15;
    return ((finalHigh<<4)|middle)>>>0;
  }
  const values=Array.from({length:256},(_,i)=>F(i));
  assert.equal(new Set(values).size,256,'Feistel must be bijective');
  const model=learnBoundedDegreeOracle(F,8,4);
  assert.ok(model.coefficients.some(([monomial,value])=>
    popcount(monomial)===4&&value!==0),
    'Feistel must have actual algebraic degree four');
  /** @type {number[]} */
  const pivots=Array(8).fill(0);
  let nonlinearRank=0;
  for(const [monomial,value] of model.coefficients) {
    if(popcount(monomial)<2)continue;
    let row=value;
    for(let bit=7;bit>=0&&row;bit--) {
      if(!((row>>>bit)&1))continue;
      if(pivots[bit])row^=pivots[bit];
      else {pivots[bit]=row;nonlinearRank++;break;}
    }
  }
  assert.equal(nonlinearRank,8,
    'Every nonzero output parity has a nonlinear coefficient');
  for(const input of [0,1,173,255]) {
    assert.equal(invertBoundedDegreeModelSymbolically(model,F(input)),null,
      'No global affine parity: the single-round algorithm must refuse');
  }
});

test('symbolic coefficient transport rejects malformed models and unsupported target domains',()=>{
  const F=/** @type {(x:number)=>number} */(x=>x);
  const model=learnBoundedDegreeOracle(F,8,2);
  assert.throws(()=>invertBoundedDegreeModelSymbolically({...model,degree:5},0),
    /degree 1..4/);
  assert.throws(()=>invertBoundedDegreeModelSymbolically(model,-1),/unsigned word/);
  assert.throws(()=>invertBoundedDegreeModelSymbolically(model,256),/unsigned word/);
  assert.throws(()=>invertBoundedDegreeModelSymbolically({
    ...model,coefficients:model.coefficients.slice(1)
  },0),/Incomplete/);
  const duplicate={
    ...model,coefficients:model.coefficients.map(([m,v],i)=>
      /** @type {[number,number]} */([i===1?0:m,v]))
  };
  assert.throws(()=>invertBoundedDegreeModelSymbolically(duplicate,0),/duplicate/);
});

test('symbolic inverter cannot certify false-degree source promises or arbitrary quadratic nonpermutations',()=>{
  const rare=/** @type {(x:number)=>number} */(x=>
    (x&127)===127?(x^128)>>>0:x);
  const model=learnBoundedDegreeOracle(rare,8,2);
  const target=rare(255);
  const candidate=invertBoundedDegreeModelSymbolically(model,target);
  assert.equal(candidate?.input,127);
  assert.notEqual(rare(candidate.input),target,
    'Without the correct degree promise an offline clone can be source-wrong');

  const nonpermutation=learnBoundedDegreeOracle(
    x=>(x&3)===3?1:0,8,2);
  assert.equal(invertBoundedDegreeModelSymbolically(nonpermutation,1),null);
});
