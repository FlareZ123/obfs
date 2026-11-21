'use strict';
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {cloneQuadratic}=require('./rankthree-quadratic-bilinear-shortcut');
const {cloneInHashBasis}=require('./rankthree-random-basis-attack');

/**
 * Clone a degree-at-most-two vector oracle with a speculative rank hint.
 * Under a true hint the early clone is mathematically exact. Under a false
 * hint, uniform independent post-model challenges reject any wrong quadratic
 * with per-trial probability >=1/4 and trigger a generic exact fallback.
 *
 * @param {(x:number)=>number} oracle
 * @param {number} n Number of input bits in [2,32].
 * @param {number} rankHint Candidate upper input-projection rank <=3.
 * @param {number} seed Fixed deterministic coordinate-basis seed.
 * @param {number} trials Number of independent postfit challenges.
 * @param {()=>number} sampleInput Uniform unsigned input generator; for an
 *   operational bound supply CSPRNG samples independent of training data.
 * @returns {{evaluate:(x:number)=>number,queries:number,early:boolean,
 *   fallback:boolean,reason:'none'|'detected-rank'|'validation',
 *   validations:number,rank:number,pivots:number}}
 */
function cloneValidated(oracle,n,rankHint,seed,trials,sampleInput){
  assert.ok(Number.isInteger(n)&&n>=2&&n<=32);
  assert.ok(Number.isInteger(rankHint)&&rankHint>=0&&rankHint<=Math.min(3,n));
  assert.ok(Number.isInteger(trials)&&trials>=0&&trials<=10000);
  const mask=n===32?0xffffffff:(2**n-1);
  /** @type {Map<number,number>} */
  const observed=new Map();
  /** @param {number} x @returns {number} */
  function ask(x){
    const input=(x&mask)>>>0;
    if(!observed.has(input))observed.set(input,oracle(input)>>>0);
    return /** @type {number} */ (observed.get(input));
  }
  /** @param {'detected-rank'|'validation'} reason @param {number} validations @returns {ReturnType<typeof cloneValidated>} */
  function generic(reason,validations){
    const full=cloneQuadratic(ask,n,null);
    return {evaluate:full.evaluate,queries:observed.size,early:false,
      fallback:true,reason,validations,rank:full.rank,pivots:full.pivots};
  }
  /** @type {ReturnType<typeof cloneInHashBasis>} */
  let model;
  try{model=cloneInHashBasis(ask,n,rankHint,seed);}
  catch(error){
    if(error instanceof Error&&error.message==='Projection-rank promise violated')
      return generic('detected-rank',0);
    throw error;
  }
  if(!model.early){
    return {evaluate:model.evaluate,queries:observed.size,early:false,
      fallback:false,reason:'none',validations:0,rank:rankHint,pivots:model.pivots};
  }
  for(let i=0;i<trials;i++){
    const input=(sampleInput()&mask)>>>0;
    if(model.evaluate(input)!==ask(input))return generic('validation',i+1);
  }
  return {evaluate:model.evaluate,queries:observed.size,early:true,
    fallback:false,reason:'none',validations:trials,
    rank:rankHint,pivots:model.pivots};
}

/** @param {number} seed @returns {()=>number} */
function seeded(seed){
  let state=seed>>>0;
  return ()=>{
    state^=state<<13;state^=state>>>17;state^=state<<5;
    return state>>>0;
  };
}
/** @param {number[]} items @returns {number} */
function rank(items){
  const pivots=Array(8).fill(0);
  let count=0;
  for(let item of items){
    for(let bit=7;bit>=0;bit--){
      if(!((item>>>bit)&1))continue;
      if(pivots[bit])item^=pivots[bit];
      else{pivots[bit]=item;count++;break;}
    }
  }
  return count;
}
function exhaustiveWidthFour(){
  const pairs=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
  let promised=0,unpromised=0,rejected=0,validated=0;
  let queries=0,outputs=0,fast=0,maxQueries=0;
  for(let encoded=0;encoded<4096;encoded++){
    const coefficients=pairs.map((_,i)=>(encoded>>>(2*i))&3);
    const columns=Array.from({length:4},(_,i)=>pairs.reduce((value,[a,b],j)=>
      value^((a===i)?coefficients[j]<<(2*b):((b===i)?coefficients[j]<<(2*a):0)),0));
    const actualRank=rank(columns);
    if(actualRank<=3)promised++;else unpromised++;
    /** @param {number} x @returns {number} */
    function F(x){
      let out=(x^(x>>>2)^encoded)&3;
      for(let i=0;i<pairs.length;i++){
        const [a,b]=pairs[i];
        if(((x>>>a)&1)&&((x>>>b)&1))out^=coefficients[i];
      }
      return out>>>0;
    }
    let online=true,checks=0;
    const model=cloneValidated(x=>{
      if(!online)throw Error('Offline clone queried original');
      return F(x);
    },4,3,encoded,16,()=>checks++);
    online=false;
    for(let x=0;x<16;x++){
      assert.equal(model.evaluate(x),F(x));
      outputs++;
    }
    if(model.early)fast++;
    if(model.reason==='detected-rank')rejected++;
    if(model.reason==='validation')validated++;
    if(actualRank>3)assert.equal(model.fallback,true);
    queries+=model.queries;
    maxQueries=Math.max(maxQueries,model.queries);
  }
  assert.equal(promised,736);
  assert.equal(unpromised,3360);
  assert.equal(outputs,65536);
  assert.equal(rejected+validated,3360);
  return {promised,unpromised,outputs,fast,rejected,validated,
    meanQueries:queries/4096,maxQueries};
}
/** @param {number} x @returns {number} */
function lateRankThree(x){
  const a=(x>>>29)&1,b=(x>>>30)&1,c=(x>>>31)&1;
  return ((a&b)|((a&c)<<1)|((b&c)<<2))>>>0;
}
/** @param {number} x @returns {number} */
function fullRankFour(x){
  return ((((x>>>0)&1)&((x>>>1)&1))|
    (((((x>>>2)&1)&((x>>>3)&1))<<1))|
    (((((x>>>4)&1)&((x>>>5)&1))<<2))|
    (((((x>>>6)&1)&((x>>>7)&1))<<3)))>>>0;
}
function wideControls(){
  const groups=[];
  for(const [label,fn] of /** @type {Array<[string,(x:number)=>number]>} */ ([
    ['true-rank-three',lateRankThree],['false-rank-three',fullRankFour]
  ])){
    let online=true;
    const model=cloneValidated(x=>{
      if(!online)throw Error('Source queried after training');
      return fn(x);
    },32,3,0x9f135c21,81,()=>randomBytes(4).readUInt32BE(0));
    online=false;
    const gen=seeded(0x501f6d3a);
    for(let i=0;i<4096;i++){
      const x=gen();
      assert.equal(model.evaluate(x),fn(x));
    }
    assert.ok(model.queries<=610);
    if(label==='true-rank-three')assert.equal(model.fallback,false);
    else assert.equal(model.fallback,true);
    groups.push({label,queries:model.queries,early:model.early,
      fallback:model.fallback,reason:model.reason,validations:model.validations,
      heldouts:4096});
  }
  return groups;
}
function main(){
  const width4=exhaustiveWidthFour();
  const width32=wideControls();
  const delta=Math.pow(0.75,81);
  assert.ok(delta<1e-10);
  console.log('VALIDATED_QUADRATIC_RANK_HINT '+JSON.stringify({
    width4,width32,validationTrials:81,idealIndependentFailureBound:delta,
    hardDistinctQueryBoundWidth32:610,
    scope:'degree-at-most-two vector functions; postfit uniform independent challenges'
  }));
}
if(require.main===module)main();
module.exports={cloneValidated,main};
