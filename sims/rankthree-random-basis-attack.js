'use strict';
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {cloneQuadratic}=require('./rankthree-quadratic-bilinear-shortcut');

/** @param {number} seed @returns {()=>number} */
function random(seed){let v=seed>>>0;return ()=>{v^=v<<13;v^=v>>>17;v^=v<<5;return v>>>0;};}
/** @param {number[]} columns @param {number} x @returns {number} */
function apply(columns,x){let y=0;for(let i=0;i<columns.length;i++)if((x>>>i)&1)y^=columns[i];return y>>>0;}
/** @param {number} value @returns {number} */
function parity(value){
  let x=value>>>0;
  x^=x>>>16;x^=x>>>8;x^=x>>>4;x^=x>>>2;x^=x>>>1;
  return x&1;
}
/** @param {number} width @param {()=>number} next @returns {number[]} */
function randomizedBasis(width,next){
  const cols=Array.from({length:width},(_,i)=>(1<<i)>>>0);
  // Invertible elementary column additions and swaps preserve basis rank.
  for(let i=0;i<12*width;i++){
    const a=next()%width;
    let b=next()%(width-1);
    if(b>=a)b++;
    if(next()&1)cols[a]=(cols[a]^cols[b])>>>0;
    else [cols[a],cols[b]]=[cols[b],cols[a]];
  }
  return cols;
}
/**
 * Reproducible SHA-256-derived candidate columns with rank rejection.
 * If source words were independent uniform, this samples uniform GL(n,2).
 * The fixed-seed hash stream is a heuristic emulation of that ideal model.
 * @param {number} width
 * @param {number} seed
 * @returns {number[]}
 */
function hashSampledBasis(width,seed){
  /** @type {Map<number,number>} */
  const pivots=new Map();
  /** @type {number[]} */
  const cols=[];
  const block=Buffer.alloc(8);
  block.writeUInt32BE(seed>>>0,0);
  const mask=width===32?0xffffffff:(2**width-1);
  for(let draw=0;cols.length<width;draw++){
    block.writeUInt32BE(draw>>>0,4);
    const candidate=(createHash('sha256').update('obfs-basis-v1')
      .update(block).digest().readUInt32BE(0)&mask)>>>0;
    let value=candidate;
    while(value){
      const bit=31-Math.clz32(value);
      const existing=pivots.get(bit);
      if(existing===undefined){pivots.set(bit,value);break;}
      value=(value^existing)>>>0;
    }
    if(value!==0)cols.push(candidate);
  }
  return cols;
}
/** @param {number[]} columns @returns {(x:number)=>number} */
function linearInverse(columns){
  /** @type {Map<number,{value:number,coords:number}>} */
  const rows=new Map();
  for(let i=0;i<columns.length;i++){
    let value=columns[i]>>>0,coords=(1<<i)>>>0;
    while(value){
      const pivot=31-Math.clz32(value);
      const row=rows.get(pivot);
      if(!row){rows.set(pivot,{value,coords});break;}
      value=(value^row.value)>>>0;
      coords=(coords^row.coords)>>>0;
    }
    assert.notEqual(value,0,'basis rank deficiency');
  }
  return x=>{
    let value=x>>>0,coords=0;
    while(value){
      const row=rows.get(31-Math.clz32(value));
      assert.ok(row);
      value=(value^row.value)>>>0;
      coords=(coords^row.coords)>>>0;
    }
    return coords>>>0;
  };
}
/**
 * A coordinate-randomized, exact quadratic low-rank interpolation attacker.
 * The seeded random basis changes query cost but never correctness or the
 * 1+n+C(n,2) chosen-value upper bound for the quadratic class.
 * @param {(x:number)=>number} oracle
 * @param {number} n
 * @param {number} rankCap
 * @param {number} seed
 * @returns {{queries:number,early:boolean,pivots:number,evaluate:(x:number)=>number}}
 */
function cloneInRandomBasis(oracle,n,rankCap,seed){
  assert.ok(Number.isInteger(n)&&n>=2&&n<=32);
  const cols=randomizedBasis(n,random(seed));
  const solve=linearInverse(cols);
  for(let i=0;i<n;i++)assert.equal(solve(cols[i]),(1<<i)>>>0);
  const model=cloneQuadratic(z=>oracle(apply(cols,z)),n,rankCap);
  return {
    queries:model.queries,early:model.early,pivots:model.pivots,
    evaluate:x=>model.evaluate(solve(x))
  };
}

/**
 * Reproducible rank-rejection basis model. The SHA-256 stream is a
 * deterministic PRNG, not an actual ideal-uniform mathematical sampler.
 * @param {(x:number)=>number} oracle
 * @param {number} n
 * @param {number} rankCap
 * @param {number} seed
 * @returns {{queries:number,early:boolean,pivots:number,evaluate:(x:number)=>number}}
 */
function cloneInHashBasis(oracle,n,rankCap,seed){
  assert.ok(Number.isInteger(n)&&n>=2&&n<=32);
  const cols=hashSampledBasis(n,seed);
  const solve=linearInverse(cols);
  for(let i=0;i<n;i++)assert.equal(solve(cols[i]),(1<<i)>>>0);
  const model=cloneQuadratic(z=>oracle(apply(cols,z)),n,rankCap);
  return {
    queries:model.queries,early:model.early,pivots:model.pivots,
    evaluate:x=>model.evaluate(solve(x))
  };
}

/** @param {number} x @returns {number} */
function lateSupport(x){
  const a=(x>>>29)&1,b=(x>>>30)&1,c=(x>>>31)&1;
  return ((a&b)|((a&c)<<1)|((b&c)<<2))>>>0;
}
function main(){
  const native=cloneQuadratic(lateSupport,32,3);
  assert.equal(native.queries,529);
  let targetChecks=0,maxRandomQueries=0,minRandomQueries=529,early=0;
  /** @type {number[]} */
  const queryCosts=[];
  const next=random(0x9f135c21);
  for(let i=0;i<128;i++){
    let online=true;
    const clone=cloneInRandomBasis(x=>{
      if(!online)throw new Error('Offline clone made an oracle request');
      return lateSupport(x);
    },32,3,next());
    online=false;
    assert.ok(clone.queries<=529);
    if(clone.early)early++;
    minRandomQueries=Math.min(minRandomQueries,clone.queries);
    maxRandomQueries=Math.max(maxRandomQueries,clone.queries);
    queryCosts.push(clone.queries);
    for(let j=0;j<128;j++){
      const x=next();
      assert.equal(clone.evaluate(x),lateSupport(x));
      targetChecks++;
    }
  }
  let generalModels=0,generalHeldouts=0;
  for(let modelNo=0;modelNo<64;modelNo++){
    const masks=[next(),next(),next()];
    const affine=Array.from({length:32},()=>next());
    const coeffs=[next(),next(),next()];
    const constant=next();
    /** @param {number} x @returns {number} */
    const general=x=>{
      const a=parity(masks[0]&x),b=parity(masks[1]&x),c=parity(masks[2]&x);
      return (constant^apply(affine,x)^((a&b)?coeffs[0]:0)^((a&c)?coeffs[1]:0)^((b&c)?coeffs[2]:0))>>>0;
    };
    let online=true;
    const fitted=cloneInRandomBasis(x=>{
      if(!online)throw Error('General oracle called after training');
      return general(x);
    },32,3,next());
    online=false;
    assert.ok(fitted.queries<=529);
    for(let i=0;i<128;i++){
      const x=next();
      assert.equal(fitted.evaluate(x),general(x));
      generalHeldouts++;
    }
    generalModels++;
  }
  /** @type {number[]} */
  const hashCosts=[];
  let hashEarly=0,hashHeldouts=0;
  /** @type {number[]} */
  const hashPivots=Array(33).fill(0);
  const nextHash=random(0x9f135c21);
  for(let i=0;i<128;i++){
    let online=true;
    const model=cloneInHashBasis(x=>{
      if(!online)throw Error('Hash-basis oracle called after training');
      return lateSupport(x);
    },32,3,nextHash());
    online=false;
    assert.ok(model.queries<=529);
    hashCosts.push(model.queries);
    hashPivots[model.pivots]++;
    if(model.early)hashEarly++;
    for(let j=0;j<128;j++){
      const x=nextHash();
      assert.equal(model.evaluate(x),lateSupport(x));
      hashHeldouts++;
    }
  }
  hashCosts.sort((a,b)=>a-b);
  const hashMean=hashCosts.reduce((a,b)=>a+b,0)/hashCosts.length;
  queryCosts.sort((a,b)=>a-b);
  const median=queryCosts[queryCosts.length/2];
  const mean=queryCosts.reduce((a,b)=>a+b,0)/queryCosts.length;
  console.log('RANKTHREE_RANDOM_BASIS '+JSON.stringify({
    source:'late-three-input-quadratic',nativeQueries:native.queries,
    randomizedTrials:queryCosts.length,earlyTrials:early,minRandomQueries,
    maxRandomQueries,medianRandomQueries:median,meanRandomQueries:mean,
    heldouts:targetChecks,generalModels,generalHeldouts,seed:'0x9f135c21',hardQueryCap:529,
    hashSampled:{trials:hashCosts.length,early:hashEarly,min:hashCosts[0],
      median:hashCosts[hashCosts.length/2],mean:hashMean,max:hashCosts[hashCosts.length-1],
      heldouts:hashHeldouts,pivotHistogram:hashPivots.map((count,pivots)=>({count,pivots})).filter(entry=>entry.count!==0)}
  }));
}
if(require.main===module)main();
module.exports={cloneInRandomBasis,cloneInHashBasis,main};
