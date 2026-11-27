'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  makeRng,makeLinearTransform,applyLinear,u32
}=require('../sims/compatible-permutation-linear-sandwich-blackbox');
const {learnBoundedDegreeOracle}=
  require('../sims/bounded-degree-oracle-functional-clone');
const {
  makeQuadraticModelEvaluator,prepareExactQuadraticInverter
}=require('../sims/exact-quadratic-compatible-cegar');

const WIDTH=32;

/** @param {number} value @returns {number} */
function parity32(value){
  let x=value>>>0;
  x^=x>>>16;x^=x>>>8;x^=x>>>4;x&=15;
  return(0x6996>>>x)&1;
}

/**
 * Independently build a full quadratic triangular permutation. Each output
 * gate has arbitrary linear and pairwise monomials in *all* lower inputs,
 * rather than the production fixture's single product of two linear forms.
 * No general-purpose obfuscator or production helper constructs these gates.
 *
 * @param {number} seed
 * @returns {(input:number)=>number}
 */
function makeFullQuadraticTriangular(seed){
  const next=makeRng(seed);
  const gates=Array.from({length:WIDTH},(_,j)=>{
    const lower=j===0?0:u32(2**j-1);
    const quadratic=[];
    for(let i=0;i<j;i++){
      const higher=u32(lower & ~u32(2**(i+1)-1));
      quadratic.push(next()&higher);
    }
    return{linear:next()&lower,quadratic,constant:next()&1};
  });
  return input=>{
    const x=input>>>0;
    let output=0;
    for(let j=0;j<WIDTH;j++){
      const gate=gates[j];
      let bit=((x>>>j)&1)^parity32(x&gate.linear)^gate.constant;
      for(let i=0;i<j;i++){
        if(((x>>>i)&1)!==0)bit^=parity32(x&gate.quadratic[i]);
      }
      if(bit!==0)output=u32(output|u32(2**j));
    }
    return output>>>0;
  };
}

/** @param {number} seed @returns {(input:number)=>number} */
function makeWrappedOracle(seed){
  const triangular=makeFullQuadraticTriangular(seed^0x1f83d9ab);
  const inner=makeLinearTransform(seed^0x5be0cd19);
  const outer=makeLinearTransform(seed^0x243f6a88);
  const next=makeRng(seed^0xb7e15162);
  const inputOffset=next(),outputOffset=next();
  return input=>u32(
    applyLinear(outer,triangular(u32(applyLinear(inner,input)^inputOffset)))^outputOffset
  );
}

test('exact greedy inversion covers arbitrary full quadratic lower-prefix gates under two affine wrappers',()=>{
  for(let attempt=0;attempt<12;attempt++){
    const seed=u32(0x752f7eb1+Math.imul(attempt,0x1020305));
    const oracle=makeWrappedOracle(seed);
    const model=learnBoundedDegreeOracle(oracle,WIDTH,2);
    assert.equal(model.queryCount,529);
    const evaluator=makeQuadraticModelEvaluator(model);
    const inverter=prepareExactQuadraticInverter(evaluator.clone,evaluator.polar);
    assert.equal(inverter.outputMasks.length,WIDTH);
    assert.equal(inverter.inputToggles.length,WIDTH);
    assert.equal(inverter.offlineDefectEvaluations,16896);
    const next=makeRng(seed^0x6a09e667);
    for(let sample=0;sample<48;sample++){
      const original=next();
      const target=oracle(original);
      assert.equal(evaluator.clone(original),target,
        'an unqueried polynomial value diverged from the independent source');
      assert.equal(inverter.invert(target),original,
        'exact derivative flag failed to invert an independently generated quadratic source');
    }
  }
});

test('direct second differences and coefficient-based polar agree on wrapped quadratic sources',()=>{
  const oracle=makeWrappedOracle(0x1101abcd);
  const model=learnBoundedDegreeOracle(oracle,WIDTH,2);
  const evaluator=makeQuadraticModelEvaluator(model);
  const next=makeRng(0x3c6ef372);
  const base=oracle(0);
  for(let i=0;i<WIDTH;i++){
    const standard=u32(2**i);
    for(let k=0;k<16;k++){
      const direction=next();
      const observed=u32(oracle(standard)^oracle(standard^direction)^base^oracle(direction));
      assert.equal(evaluator.polar(i,direction),observed);
    }
  }
  const fallback=prepareExactQuadraticInverter(evaluator.clone);
  assert.equal(fallback.offlineDefectEvaluations,16896);
  for(let sample=0;sample<8;sample++){
    const original=next();
    assert.equal(fallback.invert(oracle(original)),original);
  }
});

test('degree-three triangular gate defeats the unverified degree-two promise',()=>{
  /** @param {number} input @returns {number} */
  const cubic=input=>{
    const x=input>>>0;
    return u32(x^((x&7)===7?0x80000000:0));
  };
  const model=learnBoundedDegreeOracle(cubic,WIDTH,2);
  const evaluator=makeQuadraticModelEvaluator(model);
  assert.equal(model.queryCount,529);
  assert.equal(evaluator.clone(7),7);
  assert.equal(cubic(7),u32(7^0x80000000));
  assert.notEqual(evaluator.clone(7),cubic(7),
    'the 529-query transcript cannot certify an unpromised degree bound');
});
