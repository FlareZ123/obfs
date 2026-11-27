'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  makeRng,makeLinearTransform,applyLinear,u32
}=require('../sims/compatible-permutation-linear-sandwich-blackbox');
const {
  learnBoundedDegreeOracle,evaluateBoundedDegreeModel
}=require('../sims/bounded-degree-oracle-functional-clone');
const {
  makeCubicDefectContractor,prepareExactCubicInverter,prepareExactCubicTransportInverter
}=require('../sims/exact-cubic-compatible-cegar');
const {invertBoundedDegreeModelSymbolically}=
  require('../sims/bounded-degree-symbolic-affine-inverse');

const WIDTH=32;

/** @param {number} value @returns {number} */
function parity32(value){
  let x=value>>>0;
  x^=x>>>16;x^=x>>>8;x^=x>>>4;x&=15;
  return(0x6996>>>x)&1;
}

/**
 * Full lower-prefix quadratic and cubic ANF gates, constructed independently
 * of the inverse's monomial-contraction implementation. Each output bit j
 * is x_j XOR a Boolean polynomial in the preceding j bits, so the source
 * is bijective regardless of the chosen polynomial coefficients.
 * @param {number} seed
 * @returns {(input:number)=>number}
 */
function makeFullCubicTriangular(seed){
  const next=makeRng(seed);
  const gates=Array.from({length:WIDTH},(_,j)=>{
    const lower=j===0?0:u32(2**j-1);
    /** @type {number[][]} */
    const cubic=Array.from({length:j},()=>Array(j).fill(0));
    /** @type {number[]} */
    const quadratic=[];
    for(let i=0;i<j;i++){
      quadratic.push(next()&u32(lower&~u32(2**(i+1)-1)));
      for(let k=i+1;k<j;k++){
        cubic[i][k]=next()&u32(lower&~u32(2**(k+1)-1));
      }
    }
    return{linear:next()&lower,quadratic,cubic,constant:next()&1};
  });
  return input=>{
    const x=input>>>0;
    let output=0;
    for(let j=0;j<WIDTH;j++){
      const gate=gates[j];
      let bit=((x>>>j)&1)^parity32(x&gate.linear)^gate.constant;
      for(let i=0;i<j;i++){
        if(((x>>>i)&1)===0)continue;
        bit^=parity32(x&gate.quadratic[i]);
        for(let k=i+1;k<j;k++){
          if(((x>>>k)&1)!==0)bit^=parity32(x&gate.cubic[i][k]);
        }
      }
      if(bit!==0)output=u32(output|u32(2**j));
    }
    return output>>>0;
  };
}

/** @param {number} seed @returns {(input:number)=>number} */
function makeWrappedOracle(seed){
  const triangular=makeFullCubicTriangular(seed^0x13198a2e);
  const inner=makeLinearTransform(seed^0x5be0cd19);
  const outer=makeLinearTransform(seed^0x243f6a88);
  const next=makeRng(seed^0x1020304);
  const b=next(),a=next();
  return x=>u32(applyLinear(outer,triangular(u32(applyLinear(inner,x)^b)))^a);
}

/**
 * Evaluate a contracted cubic second difference directly from its
 * coefficients as a polynomial in x. This independent check uses the
 * source oracle only in the test, never in the attacker.
 * @param {{first:Uint32Array,second:Uint32Array}} coefficient
 * @param {number} x
 * @returns {number}
 */
function evalContracted(coefficient,x){
  const input=x>>>0;
  let result=0;
  for(let i=0;i<WIDTH;i++){
    if(((input>>>i)&1)===0)continue;
    result^=coefficient.first[i];
    for(let j=i+1;j<WIDTH;j++){
      if(((input>>>j)&1)!==0)result^=coefficient.second[i*WIDTH+j];
    }
  }
  return result>>>0;
}

test('exact cubic ANF certificate and greedy flag invert affine-wrapped full triangular cubic gates',()=>{
  for(let attempt=0;attempt<3;attempt++){
    const seed=u32(0x33445566+Math.imul(attempt,0x1020305));
    const oracle=makeWrappedOracle(seed);
    const model=learnBoundedDegreeOracle(oracle,WIDTH,3);
    assert.equal(model.queryCount,5489);
    /** @param {number} x @returns {number} */
    const clone=x=>evaluateBoundedDegreeModel(model,x);
    const contract=makeCubicDefectContractor(model);
    const next=makeRng(seed^0xa54ff53a);
    const base=oracle(0);
    for(let check=0;check<24;check++){
      const x=next(),v=next();
      const actual=u32(oracle(x)^oracle(x^v)^base^oracle(v));
      const calculated=evalContracted(contract(v),x);
      assert.equal(calculated,actual,'cubic contracted second difference mismatch');
      assert.equal(clone(x),oracle(x),'full cubic ANF clone mismatch');
    }
    const inverter=prepareExactCubicInverter(model);
    const transported=prepareExactCubicTransportInverter(model);
    assert.equal(transported.outputMasks.length,WIDTH);
    assert.equal(transported.inputToggles.length,WIDTH);
    assert.equal(transported.offlineCoefficientVectors,453376);
    assert.equal(inverter.outputMasks.length,WIDTH);
    assert.equal(inverter.inputToggles.length,WIDTH);
    assert.equal(inverter.offlineContractions,5984);
    assert.equal(inverter.offlineCoefficientVectors,453376);
    for(let i=0;i<16;i++){
      const secret=next();
      const target=oracle(secret);
      assert.equal(clone(secret),target);
      assert.equal(inverter.invert(target),secret);
      assert.equal(transported.invert(target),secret,
        'incremental mixed-tensor transport diverged from independent cubic source');
    }
  }
});

test('degree-four triangular gate spoofs all cubic low-weight oracle training values',()=>{
  /** @param {number} x @returns {number} */
  const quartic=x=>u32(x^(((x&15)===15)?0x80000000:0));
  const model=learnBoundedDegreeOracle(quartic,WIDTH,3);
  assert.equal(model.queryCount,5489);
  assert.equal(evaluateBoundedDegreeModel(model,15),15);
  assert.notEqual(evaluateBoundedDegreeModel(model,15),quartic(15));
});


test('genuine cubic nontriangular permutation refuses a globally incompatible flag',()=>{
  // Independently selected 4-bit permutation. All 4-bit Boolean permutation
  // coordinates have degree at most 3, yet this one has no nonzero affine
  // output parity. Embed it into 32 bits with the other 28 bits unchanged.
  const p=[3,15,9,11,1,14,4,0,10,12,6,8,5,2,13,7];
  assert.equal(new Set(p).size,16);
  let affineOutputMasks=0;
  for(let mask=1;mask<16;mask++){
    const base=parity32(p[0]&mask);
    let isAffine=true;
    for(let input=0;input<16;input++){
      let expected=base;
      for(let j=0;j<4;j++){
        if((input>>>j)&1)expected^=parity32(p[1<<j]&mask)^base;
      }
      if(expected!==parity32(p[input]&mask)){isAffine=false;break;}
    }
    if(isAffine)affineOutputMasks++;
  }
  assert.equal(affineOutputMasks,0,
    'control must have no nonzero affine output coordinate combination');
  /** @param {number} input @returns {number} */
  const oracle=input=>u32((input&0xfffffff0)|p[input&15]);
  const model=learnBoundedDegreeOracle(oracle,WIDTH,3);
  assert.equal(model.queryCount,5489);
  for(const input of [0,7,15,31,0xffffffff,0x76543210]){
    assert.equal(evaluateBoundedDegreeModel(model,input),oracle(input),
      'nontriangular control is genuinely degree three');
  }
  assert.throws(()=>prepareExactCubicTransportInverter(model),
    /no nonzero mask at level/,
    'tensor-transport version must independently refuse nontriangular cubic source');
  assert.throws(()=>prepareExactCubicInverter(model),
    /no nonzero mask at level/,
    'global triangular flag must not be invented for an unrelated cubic permutation');
  assert.equal(invertBoundedDegreeModelSymbolically(model,oracle(7)),null,
    'established symbolic solver should independently refuse the same source');
});


test('exact cubic certificate refuses incomplete, duplicate and out-of-degree model tables',()=>{
  /** @param {number} value @returns {number} */
  const identity=value=>value>>>0;
  const model=learnBoundedDegreeOracle(identity,WIDTH,3);
  assert.equal(model.coefficients.length,5489);
  assert.throws(()=>prepareExactCubicTransportInverter({
    ...model,coefficients:model.coefficients.slice(1)
  }),/incomplete/);
  assert.throws(()=>makeCubicDefectContractor({
    ...model,coefficients:model.coefficients.slice(1)
  }),/incomplete/);
  const duplicated=model.coefficients.map(([mask,value])=>
    /** @type {[number,number]} */([mask,value]));
  duplicated[1]=duplicated[0];
  assert.throws(()=>makeCubicDefectContractor({...model,coefficients:duplicated}),
    /duplicate/);
  const highDegree=model.coefficients.map(([mask,value])=>
    /** @type {[number,number]} */([mask,value]));
  highDegree[1]=[15,0];
  assert.throws(()=>makeCubicDefectContractor({...model,coefficients:highDegree}),
    /above promised degree/);
  const unsigned=model.coefficients.map(([mask,value])=>
    /** @type {[number,number]} */([mask,value]));
  unsigned[0]=[0,-1];
  assert.throws(()=>makeCubicDefectContractor({...model,coefficients:unsigned}),
    /unsigned/);
});
