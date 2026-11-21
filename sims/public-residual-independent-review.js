'use strict';

const assert=require('node:assert/strict');

/**
 * This is an independently implemented finite-domain verifier for the
 * deterministic public affine-residual inversion theorem (PR #181). Unlike
 * the target inverter, it uses complete truth tables and brute-force image
 * maps rather than shared GF(2) Gaussian-elimination code.
 *
 * @param {number[]} columns
 * @param {number} value
 * @returns {number}
 */
function linear(columns,value) {
  let result=0;
  for(let bit=0;bit<columns.length;bit+=1) {
    if((value&(1<<bit))!==0)result^=columns[bit];
  }
  return result;
}

/**
 * @param {number[]} vectors
 * @returns {Set<number>}
 */
function span(vectors) {
  const result=new Set([0]);
  for(const vector of vectors) {
    for(const old of [...result])result.add(old^vector);
  }
  return result;
}

/**
 * An oracle query is counted at most once per target, including the shared
 * interpolation/repair phase. A distinct target starts with a fresh cache.
 *
 * @param {number[]} f Truth table of a permutation on GF(2)^n
 * @returns {{r:number,repairs:number,expansions:number,maxQueries:number}}
 */
function verifyPermutation(f) {
  const size=f.length;
  const width=Math.log2(size);
  assert.ok(Number.isInteger(width)&&width>=1&&width<=8);
  assert.equal(new Set(f).size,size,'oracle is a permutation');
  const base=f[0];
  const M=Array.from({length:width},(_,bit)=>f[1<<bit]^base);
  const residuals=Array.from({length:size},(_,x)=>f[x]^base^linear(M,x));
  const R=span(residuals);
  const r=Math.log2(R.size);
  assert.ok(Number.isInteger(r)&&r<=width);
  const U=new Set(Array.from({length:size},(_,x)=>x).filter(x=>R.has(linear(M,x))));
  assert.equal(U.size,1<<r,'dim M^-1(R) = dim R');

  let N=M.slice();
  const prequeried=new Set([0,...Array.from({length:width},(_,bit)=>1<<bit)]);
  let repairs=0;
  let expansions=0;

  for(;;) {
    // This is a deliberately independent truth-table linear solver.
    const imagePreimage=new Map();
    /** @type {number[]} */
    const K=[];
    for(let x=0;x<size;x+=1) {
      const image=linear(N,x);
      if(!imagePreimage.has(image))imagePreimage.set(image,x);
      if(image===0)K.push(x);
      assert.ok(R.has(linear(M,x)^image),'surrogate update escaped R');
    }
    for(const k of K)assert.ok(U.has(k),'surrogate kernel escaped U');
    if(K.length===1) {
      assert.equal(imagePreimage.size,size,'surrogate not invertible');
      break;
    }

    const H=new Set(K);
    let rankRepaired=false;
    for(;;) {
      let extended=false;
      for(const v of [...H].sort((a,b)=>a-b)) {
        if(v===0)continue;
        assert.ok(U.has(v),'closure escaped U');
        prequeried.add(v);
        const delta=f[v]^base;
        assert.ok(R.has(delta),'fixed-base delta escaped R');
        const preimage=imagePreimage.get(delta);
        if(preimage===undefined) {
          const kernelDirection=K.find(k=>k!==0);
          assert.notEqual(kernelDirection,undefined);
          const bit=Math.log2(kernelDirection&-kernelDirection);
          N[bit]^=delta;
          repairs+=1;
          rankRepaired=true;
          extended=true;
          break;
        }
        if(!H.has(preimage)) {
          for(const h of [...H])H.add(h^preimage);
          expansions+=1;
          extended=true;
          break;
        }
      }
      if(rankRepaired)break;
      assert.ok(extended,'closure stalled while surrogate was singular');
    }
    assert.ok(repairs<=width,'rank repairs exceeded width');
  }

  const inverse=new Map();
  for(let x=0;x<size;x+=1)inverse.set(linear(N,x),x);
  let maxQueries=0;
  for(let secret=0;secret<size;secret+=1) {
    const target=f[secret];
    const t=inverse.get(target^base);
    assert.notEqual(t,undefined);
    const queries=new Set(prequeried);
    let current=t;
    let found=false;
    for(let step=0;step<(1<<r);step+=1) {
      queries.add(current);
      const next=inverse.get(f[current]^base);
      assert.notEqual(next,undefined);
      if(next===t) {
        assert.equal(current,secret,'wrong target predecessor');
        found=true;
        break;
      }
      current=next;
    }
    assert.ok(found,'target cycle exceeded U dimension');
    assert.ok(queries.size<=width+2*(1<<r),'query theorem bound exceeded');
    maxQueries=Math.max(maxQueries,queries.size);
  }
  return {r,repairs,expansions,maxQueries};
}

/**
 * @param {number} size
 * @param {(permutation:number[])=>void} visitor
 */
function enumeratePermutations(size,visitor) {
  const data=Array.from({length:size},(_,i)=>i);
  /** @param {number} count */
  function iterate(count) {
    if(count===1){visitor(data);return;}
    iterate(count-1);
    for(let i=0;i<count-1;i+=1) {
      const index=count%2===0?i:0;
      [data[index],data[count-1]]=[data[count-1],data[index]];
      iterate(count-1);
    }
  }
  iterate(size);
}

/** @param {number} seed @returns {()=>number} */
function xorshift32(seed) {
  let state=seed>>>0;
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  };
}

/**
 * @param {number} [width4Count]
 * @returns {{width3:{permutations:number,targets:number,maxQueries:number},width4:{seed:number,permutations:number,targets:number,withGrowth:number,withRepair:number,maxQueries:number,example:number[]|null}}}
 */
function runIndependentReview(width4Count=30000) {
  let permutations3=0;
  let maxQueries3=0;
  enumeratePermutations(8,permutation=>{
    const result=verifyPermutation(permutation);
    permutations3+=1;
    maxQueries3=Math.max(maxQueries3,result.maxQueries);
  });
  assert.equal(permutations3,40320);

  const seed=0x20261121;
  const next=xorshift32(seed);
  let withGrowth=0;
  let withRepair=0;
  let maxQueries4=0;
  /** @type {number[]|null} */
  let example=null;
  for(let i=0;i<width4Count;i+=1) {
    const permutation=Array.from({length:16},(_,value)=>value);
    for(let j=permutation.length-1;j>0;j-=1) {
      const k=next()%(j+1);
      [permutation[j],permutation[k]]=[permutation[k],permutation[j]];
    }
    const result=verifyPermutation(permutation);
    if(result.expansions>0) {
      withGrowth+=1;
      if(example===null)example=permutation.slice();
    }
    if(result.repairs>0)withRepair+=1;
    maxQueries4=Math.max(maxQueries4,result.maxQueries);
  }
  return {
    width3:{permutations:permutations3,targets:permutations3*8,maxQueries:maxQueries3},
    width4:{seed,permutations:width4Count,targets:width4Count*16,
      withGrowth,withRepair,maxQueries:maxQueries4,example}
  };
}

if(require.main===module)process.stdout.write(JSON.stringify(runIndependentReview(),null,2)+'\n');

module.exports={verifyPermutation,runIndependentReview};
