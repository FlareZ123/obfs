'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  benchmarkEquality,
  invertPermutationInt32,
  permuteInt32
}=require('../sims/mba-permutation-equality-baseline');

test('minimal permutation-polynomial equality preserves sampled Int32 behavior',()=>{
  const constants=[
    0,
    1,
    -1,
    0x13579bdf|0,
    0x80000000|0,
    0x7fffffff|0
  ];
  let state=0x12345678|0;
  for(let index=0;index<20000;index++){
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    const value=state|0;
    for(const constant of constants){
      assert.equal(
        value===constant,
        permuteInt32(value)===permuteInt32(constant)
      );
    }
  }
});

test('minimal permutation polynomial has no collisions on a 16-bit runtime slice',()=>{
  const outputs=new Set();
  for(let value=0;value<65536;value++)outputs.add(permuteInt32(value));
  assert.equal(outputs.size,65536);
});



test('generator-aware bit lifting recovers baseline comparison constants',()=>{
  let state=0x4f1bbcdc|0;
  for(let index=0;index<20000;index++){
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    const original=state|0;
    assert.equal(invertPermutationInt32(permuteInt32(original)),original);
  }
});

test('minimal nonlinear MBA equality benchmark records a strict selected-work ratio',()=>{
  const result=benchmarkEquality();
  assert.ok(Number.isFinite(result.ratio)&&result.ratio>0,JSON.stringify(result));
  assert.ok(result.hits>0,JSON.stringify(result));
  console.log('MBA_PERM_EQUALITY_BASELINE '+JSON.stringify(result));
});
