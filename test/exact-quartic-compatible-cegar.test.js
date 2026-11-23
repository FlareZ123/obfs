'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {learnBoundedDegreeOracle}=require('../sims/bounded-degree-oracle-functional-clone');
const {prepareExactBoundedDegreeInverter,makeBoundedDegreeDefectContractor}=
  require('../sims/exact-quartic-compatible-cegar');

/** @param {number} seed @returns {()=>number} */
function random32(seed){
  let state=seed>>>0;
  return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
}
/** @param {number} input @returns {number} */
function parity32(input){
  let x=input>>>0;x^=x>>>16;x^=x>>>8;x^=x>>>4;x&=15;
  return(0x6996>>>x)&1;
}
/** @param {number} input @returns {number} */
function invertibleInner(input){
  let x=input>>>0;x=(x^(x<<5))>>>0;x=(x^(x>>>11))>>>0;x=(x^(x<<17))>>>0;
  return x;
}
/** @param {number} input @returns {number} */
function invertibleOuter(input){
  let x=input>>>0;x=(x^(x>>>7))>>>0;x=(x^(x<<9))>>>0;x=(x^(x>>>13))>>>0;
  return x;
}
/**
 * Build a two-sided-affine triangular permutation with lower-bit
 * parity-products of declared Boolean degree. The source parameters stay
 * in this oracle fixture, not in the trained ANF model or inverter.
 * @param {number} seed
 * @param {2|3|4} degree
 * @returns {(input:number)=>number}
 */
function makeOracle(seed,degree){
  const next=random32(seed);
  const inputOffset=next();
  const outputOffset=next();
  const specs=Array.from({length:32},(_,bit)=>{
    const lowerMask=((2**bit)-1)>>>0;
    const gateMasks=Array.from({length:degree},()=>next()&lowerMask);
    return{linear:next()&lowerMask,constant:next()&1,gateMasks};
  });
  return input=>{
    const x=(invertibleInner(input)^inputOffset)>>>0;
    let z=0;
    for(let bit=0;bit<32;bit++){
      const spec=specs[bit],lower=x&(((2**bit)-1)>>>0);
      let gate=1;
      for(const mask of spec.gateMasks)gate&=parity32(lower&mask);
      const out=((x>>>bit)&1)^parity32(lower&spec.linear)^gate^spec.constant;
      z=(z|(((out&1)<<bit)>>>0))>>>0;
    }
    return(invertibleOuter(z)^outputOffset)>>>0;
  };
}

/** @param {number} value @returns {number} */
function bitCount(value){let x=value>>>0,n=0;while(x){x=(x&(x-1))>>>0;n++;}return n;}

test('exact basis-direction CEGAR inverts degree-two through degree-four affine-wrapped triangular sources',()=>{
  const configs=[
    {degree:2,seed:0x7191a031,queryCount:529,slots:32},
    {degree:3,seed:0x7d142c35,queryCount:5489,slots:528},
    {degree:4,seed:0x71812345,queryCount:41449,slots:5488},
    {degree:4,seed:0x25678012,queryCount:41449,slots:5488}
  ];
  for(const entry of configs){
    const degree=/** @type {2|3|4} */(entry.degree);
    const oracle=makeOracle(entry.seed,degree);
    const model=learnBoundedDegreeOracle(oracle,32,degree);
    assert.equal(model.queryCount,entry.queryCount);
    const nonzeroTop=model.coefficients.filter(([mask,value])=>
      bitCount(mask)===degree&&value!==0).length;
    assert.ok(nonzeroTop>0,'fixture should really exercise its declared highest degree');
    const inverter=prepareExactBoundedDegreeInverter(model);
    assert.equal(inverter.contractions,528);
    assert.equal(inverter.coefficientSlots,entry.slots);
    assert.ok(inverter.splitTermCount>0);
    const next=random32(entry.seed^0xbad51234);
    for(let sample=0;sample<16;sample++){
      let input=next();
      while(bitCount(input)<=degree)input=next();
      const output=oracle(input);
      assert.equal(inverter.clone(input),output,'ANF clone diverged at an unqueried input');
      assert.equal(inverter.invert(output),input,'offline greedy inverse failed');
    }
  }
});

test('quartic low-weight oracle fitting cannot certify an unpromised degree-five source',()=>{
  /** @param {number} x @returns {number} */
  const degreeFive=x=>{
    const input=x>>>0;
    return (input^((input&31)===31?0x80000000:0))>>>0;
  };
  const model=learnBoundedDegreeOracle(degreeFive,32,4);
  assert.equal(model.queryCount,41449);
  const inverter=prepareExactBoundedDegreeInverter(model);
  assert.equal(inverter.clone(31),31);
  assert.notEqual(degreeFive(31),31);
});

/**
 * Optional higher-cost deterministic stress sweep. Keep the regular focused
 * CI test fast; explicitly opt in with OBFS_STRESS_QUARTIC=1 for 24 independent
 * degree-four sources and 192 held-out postfit exact target inversions.
 */
if(process.env.OBFS_STRESS_QUARTIC==='1'){
  test('opt-in 24-seed affine triangular quartic exact inversion stress',()=>{
    for(let index=0;index<24;index++){
      const seed=(0x6e123456+Math.imul(index,0x1020305))>>>0;
      const oracle=makeOracle(seed,4);
      const model=learnBoundedDegreeOracle(oracle,32,4);
      assert.equal(model.queryCount,41449);
      const inverter=prepareExactBoundedDegreeInverter(model);
      assert.equal(inverter.contractions,528);
      assert.equal(inverter.coefficientSlots,5488);
      const next=random32(seed^0xbad51234);
      for(let sample=0;sample<8;sample++){
        let input=next();
        while(bitCount(input)<=4)input=next();
        const output=oracle(input);
        assert.equal(inverter.clone(input),output,
          'quartic held-out clone diverged at seed '+seed);
        assert.equal(inverter.invert(output),input,
          'quartic held-out inverse diverged at seed '+seed);
      }
    }
  });
}


test('sparse degree-four coefficient tables still admit lower-weight derivative slots',()=>{
  // The source monomial requires bit 31. A sparse model carries no explicit
  // zero coefficients for lower-weight masks, yet their defect slots exist.
  const model={bits:32,degree:4,
    coefficients:[[0x80000007,0x80000000]],
    queryCount:0};
  const contractor=makeBoundedDegreeDefectContractor(model);
  assert.equal(contractor.coefficientSlots,5488);
  assert.equal(contractor.splitTermCount,14);
  /** @type {number[]} */
  const first=[];
  contractor.contract(0x80000000,value=>first.push(value));
  assert.deepEqual(first,[0x80000000],
    'a high-bit direction must expose the lower-weight x monomial');
  /** @type {number[]} */
  const zero=[];
  contractor.contract(0,value=>zero.push(value));
  assert.deepEqual(zero,[]);
  /** @type {number[]} */
  const combined=[];
  contractor.contract(0x80000001,value=>combined.push(value));
  assert.deepEqual(combined,[0x80000000,0x80000000,0x80000000],
    'a two-bit direction must expose three distinct x coefficients');
});
