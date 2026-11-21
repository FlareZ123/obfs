'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {auditObservedOutputRank}=require('../sims/affine-low-rank-oracle');

// This is an ordinary four-bit permutation table whose nonlinear image
// spans all four low-bit directions after subtracting its linear interpolant.
const sbox=[12,5,6,11,9,0,10,13,3,14,15,8,4,7,1,2];

/** @param {number} input @returns {number} */
function maskedPerm(input){
  const incoming=(input^((input<<1)&255))&255;
  const nonlinear=(incoming&0xf0)|sbox[incoming&15];
  return (nonlinear^(nonlinear>>>1))&255;
}

/**
 * @param {(input:number)=>number} oracle
 * @param {number} input
 * @param {number} bits
 * @returns {number}
 */
function residual(oracle,input,bits){
  const origin=oracle(0);
  let interpolant=0;
  for(let bit=0;bit<bits;bit++){
    if((input>>>bit)&1)interpolant^=oracle((1<<bit)>>>0)^origin;
  }
  return (oracle(input)^origin^interpolant)>>>0;
}

test('256-output hidden-linear S-box certificate refutes every rank-three claim',()=>{
  const outputs=new Set(Array.from({length:256},(_,x)=>maskedPerm(x)));
  assert.equal(outputs.size,256,'the masked nonlinear candidate is a permutation');
  const probes=Array.from({length:256},(_,i)=>i);
  const result=auditObservedOutputRank(maskedPerm,8,probes);
  assert.equal(result.observedResidualRank,4);
  assert.equal(result.interpolantNullity,1);
  assert.equal(result.minimumOutputRank,4);
  assert.equal(result.distinctOracleCalls,256);
  assert.equal(result.residualWitnesses.length,4);
  for(const witness of result.residualWitnesses){
    assert.equal(witness.residual,residual(maskedPerm,witness.input,8));
  }
});

test('basis-only observations cannot certify a low output rank',()=>{
  const limited=auditObservedOutputRank(maskedPerm,8,
    Array.from({length:8},(_,bit)=>1<<bit));
  assert.equal(limited.observedResidualRank,0);
  assert.equal(limited.interpolantNullity,1);
  assert.equal(limited.minimumOutputRank,1);
  assert.equal(limited.distinctOracleCalls,9);
  assert.ok(limited.minimumOutputRank<4,
    'small sampled residual span is a lower bound, never an upper bound');
});

test('affine bijection returns zero rank across complete domain',()=>{
  /** @param {number} value @returns {number} */
  const affine=value=>((value^((value<<1)&255))^97)&255;
  const result=auditObservedOutputRank(affine,8,
    Array.from({length:256},(_,x)=>x));
  assert.equal(result.minimumOutputRank,0);
  assert.equal(result.interpolantNullity,0);
  assert.equal(result.observedResidualRank,0);
  assert.equal(result.residualWitnesses.length,0);
  assert.equal(result.distinctOracleCalls,256);
});

test('nonpermutation functions still obey the one-sided algebraic rank bound',()=>{
  // The necessary rank relation does not assume F is bijective; the separate
  // target inverter does need bijectivity to terminate on bounded cycles.
  /** @param {number} x @returns {number} */
  const nonPermutation=x=>(x&0xf0)|((x&15)===15?0:(x&15));
  const result=auditObservedOutputRank(nonPermutation,8,
    Array.from({length:256},(_,x)=>x));
  assert.ok(result.minimumOutputRank<=4);
  assert.ok(result.observedResidualRank>0);
});

test('full unsigned 32-bit base and inputs preserve signed-bit semantics',()=>{
  const result=auditObservedOutputRank(x=>x>>>0,32,
    [0xffffffff,0x80000000,0,1,0xffffffff]);
  assert.equal(result.minimumOutputRank,0);
  assert.equal(result.distinctOracleCalls,34);
});

test('invalid public oracle widths, probe values, and outputs are rejected',()=>{
  assert.throws(()=>auditObservedOutputRank(x=>x,0,[0]),RangeError);
  assert.throws(()=>auditObservedOutputRank(x=>x,8,[256]),RangeError);
  assert.throws(()=>auditObservedOutputRank(()=>-1,8,[0]),RangeError);
});
