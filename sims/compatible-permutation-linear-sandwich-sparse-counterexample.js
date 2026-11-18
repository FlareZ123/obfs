'use strict';

const assert=require('node:assert/strict');
const {invertLinearSandwich}=require('./compatible-permutation-linear-sandwich-blackbox');

const MASK32=0xffffffff;

/** @param {number} value @returns {number} */
function u32(value){return value>>>0;}

/** @param {number} seed @returns {()=>number} */
function makeRng(seed){
  let state=seed>>>0;
  return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
}

/** @param {number} bit @returns {number} */
function bitValue(bit){return u32(2**bit);}

/** @param {number} seed @returns {number[]} */
function makeLinearTransform(seed){
  const next=makeRng(seed);
  const columns=Array.from({length:32},(_,bit)=>bitValue(bit));
  for(let round=0;round<512;round+=1){
    const a=next()%32;
    let b=next()%32;
    if(a===b)b=(b+1)%32;
    if((next()&1)===0)[columns[a],columns[b]]=[columns[b],columns[a]];
    else columns[b]=u32(columns[b]^columns[a]);
  }
  return columns;
}

/** @param {number[]} columns @param {number} input @returns {number} */
function applyLinear(columns,input){
  let x=input>>>0;
  let output=0;
  let bit=0;
  while(x!==0){
    if((x&1)!==0)output^=columns[bit];
    x>>>=1;
    bit+=1;
  }
  return output>>>0;
}

/**
 * A compatible permutation with deliberately sparse top-bit nonlinearity.
 * The lower 31 output bits are unchanged. Bit 31 flips only for one exact
 * lower-31-bit pattern, so the map is triangular and bijective.
 * @param {number} trigger
 * @param {number} input
 * @returns {number}
 */
function rareTopBitPermutation(trigger,input){
  const x=input>>>0;
  return (x&MASK32>>>1)===(trigger>>>0)
    ?u32(x^0x80000000)
    :x;
}

/**
 * Deterministic adversarial case for the sampling-based sandwich learner.
 * @returns {{secret:number,trigger:number,target:number,oracleQueries:number,error:string}}
 */
function runSparseCounterexample(){
  const seed=0x6a09e667;
  const inner=makeLinearTransform(seed^0xbb67ae85);
  const outer=makeLinearTransform(seed^0x3c6ef372);
  const secret=makeRng(seed^0xa54ff53a)();
  const hidden=applyLinear(inner,secret);
  const trigger=hidden&0x7fffffff;

  /** @param {number} input @returns {number} */
  const evaluate=input=>applyLinear(
    outer,
    rareTopBitPermutation(trigger,applyLinear(inner,input))
  );
  const target=evaluate(secret);
  let oracleQueries=0;
  /** @param {number} input @returns {number} */
  const oracle=input=>{oracleQueries+=1;return evaluate(input);};

  let error='';
  try{
    invertLinearSandwich(oracle,target,seed^0x510e527f);
  }catch(caught){
    error=caught instanceof Error?caught.message:String(caught);
  }
  assert.equal(error,'sandwich inversion failed final equality');
  assert.ok(oracleQueries>14000&&oracleQueries<14500);
  return{secret,trigger,target,oracleQueries,error};
}

function main(){
  console.log(JSON.stringify({
    model:'rare-trigger compatible permutation counterexample to sampling-certified sandwich inversion',
    result:runSparseCounterexample()
  },null,2));
}

if(require.main===module)main();
module.exports={runSparseCounterexample};
