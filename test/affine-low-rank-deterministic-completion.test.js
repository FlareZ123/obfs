'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {invertLowRankDeterministic}=require('../sims/affine-low-rank-oracle');

/** @param {number[]} values @returns {number[][]} */
function permutations(values){
  if(!values.length)return [[]];
  /** @type {number[][]} */
  const output=[];
  for(let i=0;i<values.length;i++){
    for(const suffix of permutations(values.filter((_,index)=>index!==i)))
      output.push([values[i],...suffix]);
  }
  return output;
}

/** @param {number} seed @returns {()=>number} */
function seeded(seed){
  let state=seed>>>0;
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  };
}

/**
 * @param {number} bits
 * @param {()=>number} next
 * @returns {number[]}
 */
function invertible(bits,next){
  const columns=Array.from({length:bits},(_,i)=>(1<<i)>>>0);
  for(let step=0;step<12*bits;step++){
    const i=next()%bits;
    const j=(i+1+next()%(bits-1))%bits;
    columns[i]=(columns[i]^columns[j])>>>0;
  }
  return columns;
}

/** @param {number[]} columns @param {number} input @returns {number} */
function linear(columns,input){
  let output=0;
  for(let bit=0;bit<columns.length;bit++)
    if((input>>>bit)&1)output=(output^columns[bit])>>>0;
  return output;
}

/** @param {number} input @returns {number} */
function transposed(input){
  const low=input&7;
  const shifted=low===3?4:low===4?3:low;
  return ((input&~7)|shifted)>>>0;
}

/**
 * @param {(input:number)=>number} oracle
 * @param {number} targetInput
 * @param {number} rankBound
 * @returns {ReturnType<typeof invertLowRankDeterministic>}
 */
function verify32(oracle,targetInput,rankBound){
  const target=oracle(targetInput);
  const result=invertLowRankDeterministic(oracle,target,{bits:32,rankBound});
  assert.equal(result.preimage,targetInput);
  assert.equal(oracle(result.preimage),target);
  assert.equal(result.oracleCalls,33+result.orbitCalls);
  assert.equal(result.completionDirections,result.nullity);
  assert.ok(result.nullity<=rankBound);
  assert.ok(result.orbitCalls<=result.provenOrbitUpperBound);
  assert.equal(result.provenOrbitUpperBound,
    2**Math.min(32,rankBound+result.nullity));
  return result;
}

test('every width-three permutation and target is inverted with deterministic bound',()=>{
  let checked=0;
  for(const outputs of permutations([0,1,2,3,4,5,6,7])){
    const oracle=/** @param {number} x */(x)=>outputs[x];
    for(let target=0;target<8;target++){
      const result=invertLowRankDeterministic(oracle,target,{
        bits:3,rankBound:3
      });
      assert.equal(outputs[result.preimage],target);
      assert.equal(result.oracleCalls,4+result.orbitCalls);
      assert.ok(result.orbitCalls<=Math.min(8,2**(3+result.nullity)));
      checked++;
    }
  }
  assert.equal(checked,40320*8);
});

test('32-bit rank-one singular interpolation needs no random completion',()=>{
  const random=seeded(0x702b2d6b);
  for(let sample=0;sample<12;sample++){
    const out=invertible(32,random);
    const offset=random();
    /** @param {number} input @returns {number} */
    const oracle=input=>(linear(out,transposed(input))^offset)>>>0;
    for(const input of [0,1,2,3,4,5,7,8,0x80000000,0xffffffff,
      random(),random()]){
      const result=verify32(oracle,input,1);
      assert.equal(result.nullity,1);
      assert.ok(result.oracleCalls<=37);
    }
  }
});

test('hidden input/output coordinates preserve rank-one inverse bound',()=>{
  const random=seeded(0x2f91c051);
  for(let sample=0;sample<24;sample++){
    const incoming=invertible(32,random);
    const outgoing=invertible(32,random);
    const constOutput=random();
    /** @param {number} input @returns {number} */
    const oracle=input=>
      (linear(outgoing,transposed(linear(incoming,input)))^constOutput)>>>0;
    for(const input of [0,1,3,4,7,0xffffffff,random(),random()])
      verify32(oracle,input,1);
  }
});

/**
 * A 32-bit permutation with three independent hidden displacement directions.
 * Each pair is swapped, and every other 32-bit word is fixed. The first
 * three public affine columns are collapsed onto later columns, giving
 * exact interpolant nullity three despite valid permutation semantics.
 * @param {number} input
 * @returns {number}
 */
function sparseRankThree(input){
  switch(input){
    case 1:return 72;
    case 72:return 1;
    case 2:return 144;
    case 144:return 2;
    case 4:return 288;
    case 288:return 4;
    default:return input>>>0;
  }
}

test('32-bit rank-three singular affine interpolation without random sampling',()=>{
  const random=seeded(0x3f80a329);
  for(let sample=0;sample<16;sample++){
    const outgoing=invertible(32,random);
    const translation=random();
    /** @param {number} input @returns {number} */
    const oracle=input=>
      (linear(outgoing,sparseRankThree(input))^translation)>>>0;
    for(const input of [0,1,72,2,144,4,288,3,7,511,0xffffffff,
      random(),random()]){
      const result=verify32(oracle,input,3);
      assert.equal(result.nullity,3);
      assert.equal(result.provenOrbitUpperBound,64);
      assert.ok(result.oracleCalls<=97);
    }
  }
});

test('32-bit rank-three sparse support survives hidden affine input maps',()=>{
  const random=seeded(0x7d2590bc);
  for(let sample=0;sample<16;sample++){
    const incoming=invertible(32,random);
    const outgoing=invertible(32,random);
    const translation=random();
    /** @param {number} input @returns {number} */
    const oracle=input=>
      (linear(outgoing,sparseRankThree(linear(incoming,input)))^translation)>>>0;
    for(const input of [0,1,2,3,4,7,0xffffffff,random(),random()])
      verify32(oracle,input,3);
  }
});

test('rank promise and budget caps cause explicit refusal',()=>{
  assert.throws(()=>invertLowRankDeterministic(transposed,0,{
    bits:32,rankBound:0
  }),/rank bound/u);
  assert.throws(()=>invertLowRankDeterministic(transposed,0,{
    bits:32,rankBound:1,maxOrbitCalls:0
  }),/orbit call cap/u);
  assert.throws(()=>invertLowRankDeterministic(transposed,0,{
    bits:32,rankBound:1,maxOrbitCalls:5
  }),/orbit call cap/u);
  let longTarget=-1;
  for(let input=0;input<32;input++){
    const answer=invertLowRankDeterministic(transposed,transposed(input),{
      bits:32,rankBound:1
    });
    if(answer.orbitCalls>1){longTarget=transposed(input);break;}
  }
  assert.notEqual(longTarget,-1,'A real nontrivial transformed cycle is needed');
  assert.throws(()=>invertLowRankDeterministic(transposed,longTarget,{
    bits:32,rankBound:1,maxOrbitCalls:1
  }),/orbit cap/u);
});
