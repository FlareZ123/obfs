'use strict';

const assert=require('node:assert/strict');

/** @typedef {{input:number,output:number}} Pair */
/** @typedef {{input:number,output:number,oracleCalls:number,adaptiveCalls:number,
 * dimension:number,candidateCount:number,pairedBasisSize:number,sampleCount:number}} Inversion */

/** @param {number} n @returns {number} */
function wordMask(n){
  if(!Number.isInteger(n)||n<1||n>32)throw new RangeError('1<=n<=32');
  return n===32?0xffffffff:(2**n-1)>>>0;
}

/**
 * Incrementally reduce GF(2) vectors, retaining their coordinates in the
 * supplied independent basis. The reducer is only ever constructed from
 * vectors already certified independent.
 * @param {readonly number[]} vectors
 * @param {number} n
 * @returns {(value:number)=>{residual:number,coordinates:number}}
 */
function reducer(vectors,n){
  if(vectors.length>32)throw new RangeError('A word cannot encode more than 32 basis indices');
  /** @type {number[]} */
  const pivots=Array(n).fill(0);
  /** @type {number[]} */
  const coordinates=Array(n).fill(0);
  for(let index=0;index<vectors.length;index++){
    let value=vectors[index]>>>0;
    let used=(2**index)>>>0;
    for(let bit=n-1;bit>=0;bit--){
      if(((value>>>bit)&1)===0)continue;
      if(pivots[bit]!==0){value=(value^pivots[bit])>>>0;used=(used^coordinates[bit])>>>0;}
      else {pivots[bit]=value;coordinates[bit]=used;value=0;break;}
    }
    if(value!==0)throw new Error('Unexpected reducer residual');
  }
  /** @param {number} valueToReduce */
  return valueToReduce=>{
    let remaining=valueToReduce>>>0,used=0;
    for(let bit=n-1;bit>=0;bit--){
      if(((remaining>>>bit)&1)===0||pivots[bit]===0)continue;
      remaining=(remaining^pivots[bit])>>>0;
      used=(used^coordinates[bit])>>>0;
    }
    return {residual:remaining,coordinates:used};
  };
}

/**
 * Find a common independent set of maximal cardinality in the two linear
 * matroids defined by the input/output coordinates of sampled oracle pairs.
 * The augmenting-path exchange graph implements the matroid intersection
 * algorithm, with either an augmenting path or a proof of maximality.
 * 
 * @param {readonly Pair[]} samples
 * @param {number} n
 * @returns {number[]}
 */
function maximumPairedIndependentSet(samples,n){
  const selected=new Set();
  for(let augmentation=0;augmentation<n;augmentation++){
    const inside=[...selected];
    const outside=Array.from({length:samples.length},(_,i)=>i).filter(i=>!selected.has(i));
    const rin=reducer(inside.map(i=>samples[i].input),n);
    const rout=reducer(inside.map(i=>samples[i].output),n);
    /** @type {Map<number,{input:{residual:number,coordinates:number},output:{residual:number,coordinates:number}}>} */
    const reduced=new Map();
    for(const i of outside)reduced.set(i,{input:rin(samples[i].input),output:rout(samples[i].output)});
    /** @type {Map<number,number|null>} */
    const parent=new Map();
    /** @type {number[]} */
    const queue=[];
    for(const e of outside){
      if(reduced.get(e)?.input.residual!==0){parent.set(e,null);queue.push(e);}
    }
    /** @type {number|undefined} */
    let found;
    for(let head=0;head<queue.length;head++){
      const current=queue[head];
      if(!selected.has(current)){
        const output=reduced.get(current)?.output;
        if(output&&output.residual!==0){found=current;break;}
        if(!output)throw new Error('Missing exchange coordinates');
        for(let j=0;j<inside.length;j++){
          const f=inside[j];
          if(parent.has(f))continue;
          if(output.residual!==0||((output.coordinates>>>j)&1)!==0){
            parent.set(f,current);queue.push(f);
          }
        }
      }else{
        const j=inside.indexOf(current);
        if(j<0)throw new Error('Invalid exchange graph');
        for(const e of outside){
          if(parent.has(e))continue;
          const input=reduced.get(e)?.input;
          if(input&&(input.residual!==0||((input.coordinates>>>j)&1)!==0)){
            parent.set(e,current);queue.push(e);
          }
        }
      }
    }
    if(found===undefined)break;
    for(let v=/** @type {number|null} */(found);v!==null;){
      if(selected.has(v))selected.delete(v);
      else selected.add(v);
      const predecessor=parent.get(v);
      if(predecessor===undefined)throw new Error('Invalid alternating path');
      v=predecessor;
    }
    if(selected.size!==inside.length+1)throw new Error('Matroid augmentation cardinality violation');
    const current=[...selected];
    reducer(current.map(i=>samples[i].input),n);
    reducer(current.map(i=>samples[i].output),n);
  }
  return [...selected];
}

/**
 * Invert a target with an unknown rank-r additive deviation from some
 * invertible linear map. The oracle MUST be a bijection of n-bit words,
 * and a supplied paired basis MUST be valid (both projections full rank).
 *
 * Given a mathematically exact paired basis, no assumption is made about
 * the hidden residual function: it may be sparse or computationally hard.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} target
 * @param {readonly Pair[]} samples
 * @param {number} n
 * @param {number} rankUpperBound
 * @returns {Inversion}
 */
function invertBoundedResidual(oracle,target,samples,n,rankUpperBound){
  const mask=wordMask(n);
  if(!Number.isInteger(rankUpperBound)||rankUpperBound<0||rankUpperBound>n)
    throw new RangeError('Invalid residual-rank promise');
  const selected=maximumPairedIndependentSet(samples,n);
  if(selected.length!==n)throw new Error('No paired input/output basis was found');
  const basis=selected.map(i=>samples[i]);
  const outputReducer=reducer(basis.map(pair=>pair.output),n);
  /** @param {number} output @returns {number} */
  function applyInverse(output){
    const reduced=outputReducer(output);
    if(reduced.residual!==0)throw new Error('Output basis is not full rank');
    let input=0;
    for(let i=0;i<n;i++)if(((reduced.coordinates>>>i)&1)!==0)input^=basis[i].input;
    return input>>>0;
  }
  const f0=oracle(0)>>>0;
  if(((f0&mask)>>>0)!==f0||((target&mask)>>>0)!==(target>>>0))throw new RangeError('Out of range target');
  const span=[0],spanSet=new Set(span),tried=new Set();
  let adaptiveCalls=0;
  for(let i=0;i<span.length;i++){
    const h=span[i];
    if(tried.has(h))continue;
    tried.add(h);
    const candidate=applyInverse(((target^f0)^h)>>>0);
    const observed=oracle(candidate)>>>0;
    adaptiveCalls++;
    if(((observed&mask)>>>0)!==observed)throw new RangeError('Out of range oracle');
    if(observed===(target>>>0)){
      return {input:candidate,output:observed,oracleCalls:adaptiveCalls+1,
        adaptiveCalls,dimension:Math.log2(span.length),candidateCount:tried.size,
        pairedBasisSize:n,sampleCount:samples.length};
    }
    const delta=(observed^target)>>>0;
    if(!spanSet.has(delta)){
      const current=span.slice();
      for(const value of current){
        const combined=(value^delta)>>>0;
        if(spanSet.has(combined))throw new Error('Unexpected dependent residual');
        spanSet.add(combined);span.push(combined);
      }
      if(span.length>2**rankUpperBound)
        throw new Error('Oracle violates the claimed residual-rank bound');
    }
  }
  throw new Error('Inconsistent permutation or residual-rank assumptions');
}

/** @param {number} seed @returns {()=>number} */
function xorshift32(seed){
  let state=seed>>>0;
  if(state===0)throw new RangeError('Zero seed');
  return ()=>{
    state^=state<<13;state^=state>>>17;state^=state<<5;
    return state>>>0;
  };
}

/** @param {number} n @param {()=>number} next @returns {number[]} */
function randomInvertibleColumns(n,next){
  const columns=Array.from({length:n},(_,i)=>(2**i)>>>0);
  for(let i=0;i<6*n;i++){
    const a=next()%n;
    const b=(a+1+next()%(n-1||1))%n;
    if(a!==b)columns[a]=(columns[a]^columns[b])>>>0;
  }
  return columns;
}

/** @param {readonly number[]} columns @param {number} input @returns {number} */
function applyColumns(columns,input){
  let out=0;
  for(let i=0;i<columns.length;i++)if(((input>>>i)&1)!==0)out^=columns[i];
  return out>>>0;
}

/**
 * Generate a bijection conjugating a rank-r (0<=r<=3) nonlinear, potentially
 * sparse top-bit shuffle by arbitrary invertible bit-linear maps. The top
 * permutation depends only on unchanged low bits, so the public F is a
 * permutation. Its additive deviation from A_out*A_in is in an r-space.
 * @param {number} n
 * @param {number} r
 * @param {number} seed
 * @param {'dense'|'sparse'} shape
 * @returns {(input:number)=>number}
 */
function generateLowRankPermutation(n,r,seed,shape){
  const mask=wordMask(n);
  if(!Number.isInteger(r)||r<0||r>3||r>n)throw new RangeError('0<=r<=min(n,3)');
  const next=xorshift32(seed);
  const a=randomInvertibleColumns(n,next);
  const b=randomInvertibleColumns(n,next);
  const lowCount=n-r;
  const lowMask=wordMask(lowCount||1) & (lowCount===0?0:0xffffffff);
  const highMask=(2**r-1)>>>0;
  const trigger=next()&lowMask;
  const constant=next()&mask;
  /** @type {number[][]} */
  const variants=[];
  for(let i=0;i<4;i++){
    const perm=Array.from({length:2**r},(_,j)=>j);
    for(let j=perm.length-1;j>0;j--){const k=next()%(j+1);[perm[j],perm[k]]=[perm[k],perm[j]];}
    variants.push(perm);
  }
  return input=>{
    const inside=applyColumns(a,input>>>0);
    const low=inside&lowMask;
    const high=r?(inside>>>lowCount)&highMask:0;
    const selector=shape==='sparse'?(low===trigger?1:0):
      (((Math.imul(low^(low>>>11),0x9e3779b1)>>>0)^seed)>>>17)&3;
    const changed=((variants[selector][high]<<lowCount)>>>0)|low;
    return ((applyColumns(b,changed)^constant)&mask)>>>0;
  };
}

/**
 * Empirical trial: randomized hidden linear maps and both dense and sparse
 * rank-r bijections. The static bound is promise-conditional and does NOT
 * establish the statistical sampling success probability on its own.
 * @param {{width:number,rank:number,seeds:number,sampleCount:number,shape:'dense'|'sparse',targetsPerCase:number,initialBasis?:boolean}} config
 * @returns {{width:number,rank:number,seeds:number,shape:string,targets:number,failures:number,maxAdaptiveQueries:number,minBasis:number,distinctSampleInputs:number}}
 */
function runTrials(config){
  const {width:n,rank:r,seeds,sampleCount,shape,targetsPerCase,initialBasis=false}=config;
  const mask=wordMask(n);
  const seenInput=new Set();
  let targets=0,failures=0,maxAdaptiveQueries=0,minBasis=n;
  for(let seed=1;seed<=seeds;seed++){
    const f=generateLowRankPermutation(n,r,(0x6a09e667+seed*1013904223)>>>0,shape);
    if(n<=8){
      const y=Array.from({length:2**n},(_,x)=>f(x));
      assert.equal(new Set(y).size,2**n,'Permutation generator not bijective');
    }
    const next=xorshift32((0x9e3779b9^seed^n^r)>>>0);
    /** @type {Pair[]} */
    const samples=[];
    const base=f(0);
    if(initialBasis){
      for(let i=0;i<n;i++){
        const input=(2**i)>>>0;
        samples.push({input,output:(f(input)^base)>>>0});
      }
    }
    for(let i=0;i<sampleCount;i++){
      const input=next()&mask;
      seenInput.add(input);
      samples.push({input,output:(f(input)^base)>>>0});
    }
    const basis=maximumPairedIndependentSet(samples,n);
    minBasis=Math.min(minBasis,basis.length);
    if(basis.length!==n){failures++;continue;}
    for(let t=0;t<targetsPerCase;t++){
      const secret=n<=8?t%(2**n):(next()&mask)>>>0;
      const target=f(secret);
      const attempt=invertBoundedResidual(f,target,samples,n,r);
      assert.equal(attempt.input,secret,'Wrong target preimage');
      assert.equal(attempt.output,target);
      assert.ok(attempt.adaptiveCalls<=2**r,'Exceeded rank-r query bound');
      maxAdaptiveQueries=Math.max(maxAdaptiveQueries,attempt.adaptiveCalls);
      targets++;
    }
  }
  return {width:n,rank:r,seeds,shape,targets,failures,
    maxAdaptiveQueries,minBasis,distinctSampleInputs:seenInput.size};
}

function main(){
  const cases=/** @type {Parameters<typeof runTrials>[0][]} */([
    {width:5,rank:2,seeds:12,sampleCount:48,shape:'dense',targetsPerCase:32},
    {width:7,rank:3,seeds:12,sampleCount:64,shape:'sparse',targetsPerCase:64},
    {width:32,rank:2,seeds:12,sampleCount:592,shape:'dense',targetsPerCase:16},
    {width:32,rank:3,seeds:12,sampleCount:592,shape:'sparse',targetsPerCase:16},
    {width:32,rank:2,seeds:12,sampleCount:166,shape:'dense',targetsPerCase:16,initialBasis:true},
    {width:32,rank:3,seeds:12,sampleCount:232,shape:'sparse',targetsPerCase:16,initialBasis:true}
  ]);
  const results=cases.map(runTrials);
  assert.ok(results.every(x=>x.failures===0));
  console.log('LOW_RANK_MATROID_INVERSION '+JSON.stringify(results));
}

if(require.main===module)main();
module.exports={wordMask,reducer,maximumPairedIndependentSet,invertBoundedResidual,
  generateLowRankPermutation,runTrials};
