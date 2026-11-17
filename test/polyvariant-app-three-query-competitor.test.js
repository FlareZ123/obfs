'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {threeQueryTranslationClone}=require('../sims/polyvariant-app-three-query-competitor');

test('same three-output probe recovers selected signed Int32 translations',()=>{
  /** @type {Record<string,(n:number)=>number>} */
  const exposed={
    round1:/** @param {number} n */ n=>((n|0)+324)|0,
    round2:/** @param {number} n */ n=>((n|0)+292)|0,
    round3:/** @param {number} n */ n=>((n|0)+324)|0
  };
  const attack=threeQueryTranslationClone(exposed);
  assert.equal(attack.oracleCalls,3);
  assert.deepEqual({...attack.offsets},{round1:324,round2:292,round3:324});
  for(const name of ['round1','round2','round3']){
    for(const input of [-2147483648,-1,-0,0,1,2147483647,NaN,Infinity,1.25]){
      assert.ok(Object.is(attack.clone[name](input),exposed[name](input)));
    }
  }
});

test('the three-query model does not recover arbitrary nonlinear functions',()=>{
  /** @type {Record<string,(n:number)=>number>} */
  const exposed={
    round1:/** @param {number} n */ n=>Math.imul(n|0,n|0)|0,
    round2:/** @param {number} n */ n=>Math.imul(n|0,3)|0,
    round3:/** @param {number} n */ n=>(n|0)^17
  };
  const attack=threeQueryTranslationClone(exposed);
  assert.equal(attack.oracleCalls,3);
  for(const name of ['round1','round2','round3']){
    assert.equal(attack.clone[name](0),exposed[name](0));
    assert.notEqual(attack.clone[name](5),exposed[name](5));
  }
});

test('probe refuses incomplete or non-Int32 public APIs',()=>{
  assert.throws(()=>threeQueryTranslationClone({round1:()=>1}),
    /Missing public numeric export/u);
  assert.throws(()=>threeQueryTranslationClone({
    round1:()=>0.5,round2:()=>0,round3:()=>0
  }),/violates Int32/u);
});
