'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {prepareLowRankBatchInverter}=require('../sims/agent20-lowrank-batch-index');

/** @param {number} seed @returns {()=>number} */
function seeded(seed) {
  let x=seed>>>0;
  return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;};
}
/** @param {number} seed @returns {number[]} */
function matrix(seed) {
  const draw=seeded(seed),cols=Array.from({length:8},(_,i)=>1<<i);
  for(let i=0;i<96;i++){
    let a=draw()%8,b=draw()%8;
    if(a===b)b=(b+1)%8;
    if(draw()&1)cols[a]^=cols[b];
    else [cols[a],cols[b]]=[cols[b],cols[a]];
  }
  return cols;
}
/** @param {number[]} cols @param {number} input @returns {number} */
function linear(cols,input) {
  let value=0;
  for(let i=0;i<8;i++)if((input>>>i)&1)value^=cols[i];
  return value&255;
}
/** @param {number[]} cols @returns {number[]} */
function inverseTable(cols) {
  const inverse=Array(256).fill(-1);
  for(let x=0;x<256;x++){
    const y=linear(cols,x);
    assert.equal(inverse[y],-1,'input matrix must be bijective');
    inverse[y]=x;
  }
  return inverse;
}
/** @param {number} width @param {()=>number} draw @returns {number[]} */
function permutation(width,draw) {
  const p=Array.from({length:width},(_,x)=>x);
  for(let i=width-1;i>0;i--){
    const j=draw()%(i+1);
    [p[i],p[j]]=[p[j],p[i]];
  }
  return p;
}
/** @param {number[]} table @returns {number} */
function residualRank(table) {
  const c=table[0],columns=Array.from({length:8},(_,bit)=>table[1<<bit]^c);
  const basis=Array(8).fill(0);
  let rank=0;
  for(let x=0;x<256;x++){
    let residual=table[x]^c^linear(columns,x);
    for(let bit=7;bit>=0;bit--){
      if(!((residual>>>bit)&1))continue;
      if(basis[bit])residual^=basis[bit];
      else {basis[bit]=residual;rank++;break;}
    }
  }
  return rank;
}
/**
 * @param {number} outputRank
 * @param {number} seed
 * @returns {{oracle:(x:number)=>number,secrets:number[]}}
 */
function fixture(outputRank,seed) {
  const draw=seeded(seed^0x9e3779b9),inputColumns=matrix(seed^0x13579bdf);
  const outputColumns=matrix(seed^0x2468ace0),inverse=inverseTable(inputColumns);
  const inputBias=draw()&255,outputBias=draw()&255;
  const lowMask=(1<<outputRank)-1;
  const fibers=Array.from({length:1<<(8-outputRank)},()=>
    permutation(1<<outputRank,draw));
  /** @param {number} x @returns {number} */
  const oracle=x=>{
    const hidden=linear(inputColumns,x)^inputBias;
    const fiber=hidden>>>outputRank;
    const output=((fiber<<outputRank)|fibers[fiber][hidden&lowMask])&255;
    return linear(outputColumns,output)^outputBias;
  };
  const table=Array.from({length:256},(_,x)=>oracle(x));
  assert.equal(new Set(table).size,256);
  assert.ok(residualRank(table)<=outputRank,
    'published affine-residual output rank must not exceed the promised fiber width');
  const fiberCount=Math.min(6,fibers.length);
  const lowValues=[0,1,lowMask,seed&lowMask];
  const secrets=[...new Set(Array.from({length:fiberCount},(_,f)=>
    lowValues.map(low=>inverse[(((f<<outputRank)|low)^inputBias)&255])).flat())];
  return {oracle,secrets};
}

test('seeded hidden-affine fiber permutations obey multi-coset batch caps',()=>{
  const totals={families:0,targets:0,singularFamilies:0,
    deterministicQueries:0,sampledQueries:0,
    maxDeterministicQueries:0,maxSampledQueries:0,
    sampledCompletionCalls:0,maxRank:0};
  for(let r=1;r<=4;r++)for(let caseId=0;caseId<24;caseId++){
    const seed=(0x2468ace1^(r<<24)^Math.imul(caseId+1,0x9e3779b9))>>>0;
    const {oracle,secrets}=fixture(r,seed);
    const requested=secrets.map(oracle);
    const cosets=Math.min(6,1<<(8-r));
    let rawCallsA=0,rawCallsB=0;
    const deterministic=prepareLowRankBatchInverter(x=>{rawCallsA++;return oracle(x);},{bits:8,rankBound:r});
    let sampleIndex=0;
    const sampled=prepareLowRankBatchInverter(x=>{rawCallsB++;return oracle(x);},{
      bits:8,rankBound:r,completion:'sampled-residual',
      sample:()=>sampleIndex++&255,maxSamples:256
    });
    const d=deterministic.stats().interpolantNullity;
    assert.equal(sampled.stats().interpolantNullity,d);
    assert.ok(d<=r);
    if(d>0)totals.singularFamilies++;
    for(let i=0;i<requested.length;i++){
      const exactA=deterministic.invert(requested[i]);
      const exactB=sampled.invert(requested[i]);
      assert.equal(exactA.preimage,secrets[i],'deterministic r='+r+' seed='+seed+' target='+i);
      assert.equal(exactB.preimage,secrets[i],'sampled r='+r+' seed='+seed+' target='+i);
      totals.targets++;
    }
    const a=deterministic.stats(),b=sampled.stats();
    assert.equal(a.totalCalls,rawCallsA,'deterministic raw oracle counter agrees with cache');
    assert.equal(b.totalCalls,rawCallsB,'sampled raw oracle counter agrees with cache');
    assert.ok(a.totalCalls<=9+cosets*(2**(r+d)),
      'deterministic '+a.totalCalls+' exceeded '+(9+cosets*2**(r+d)));
    assert.ok(b.totalCalls<=9+b.samplingCalls+cosets*(2**r),
      'sampled '+b.totalCalls+' exceeded '+(9+b.samplingCalls+cosets*2**r));
    for(const y of requested){
      assert.equal(deterministic.invert(y).newOracleCalls,0);
      assert.equal(sampled.invert(y).newOracleCalls,0);
    }
    assert.equal(rawCallsA,a.totalCalls,'repeat batch must not requery raw oracle');
    assert.equal(rawCallsB,b.totalCalls,'repeat batch must not requery raw oracle');
    // Target order is not supplied during setup. Every complete orbit is
    // indexed once regardless of the order that adaptive consumers request
    // its outputs; recomputing from the same frozen source and sample plan
    // must therefore consume the same distinct oracle-input set.
    const order=Array.from({length:requested.length},(_,i)=>i);
    const draw=seeded(seed^0xbadc0ffe);
    for(let i=order.length-1;i>0;i--){
      const j=draw()%(i+1);
      [order[i],order[j]]=[order[j],order[i]];
    }
    const shuffledA=prepareLowRankBatchInverter(oracle,{bits:8,rankBound:r});
    let shuffledSample=0;
    const shuffledB=prepareLowRankBatchInverter(oracle,{
      bits:8,rankBound:r,completion:'sampled-residual',
      sample:()=>shuffledSample++&255,maxSamples:256
    });
    for(const i of order){
      assert.equal(shuffledA.invert(requested[i]).preimage,secrets[i]);
      assert.equal(shuffledB.invert(requested[i]).preimage,secrets[i]);
    }
    assert.equal(shuffledA.stats().totalCalls,a.totalCalls,
      'full-cycle cache must not depend on requested target order');
    assert.equal(shuffledB.stats().totalCalls,b.totalCalls,
      'sampled full-cycle cache must not depend on target order');
    totals.families++;
    totals.deterministicQueries+=a.totalCalls;
    totals.sampledQueries+=b.totalCalls;
    totals.maxDeterministicQueries=Math.max(totals.maxDeterministicQueries,a.totalCalls);
    totals.maxSampledQueries=Math.max(totals.maxSampledQueries,b.totalCalls);
    totals.sampledCompletionCalls+=b.samplingCalls;
    totals.maxRank=Math.max(totals.maxRank,r);
  }
  assert.equal(totals.families,96);
  assert.ok(totals.singularFamilies>0,'must exercise singular interpolants');
  assert.ok(totals.sampledCompletionCalls>0,'must exercise quotient completion');
  console.log('LOWRANK_BATCH_FIBER_FUZZ '+JSON.stringify(totals));
});


test('noninjective and stateful sources are explicitly outside batch-permutation guarantees',()=>{
  const noninjective=[5,3,4,0,0,5,5,1];
  const collision=prepareLowRankBatchInverter(x=>noninjective[x],{
    bits:3,rankBound:3
  });
  assert.throws(()=>collision.invert(1),/not injective/u,
    'observable duplicate outputs must not be silently certified as a permutation');

  // This is a deliberate out-of-contract counterexample, not a bug in the
  // deterministic implementation. A session-rotating oracle invalidates
  // previously cached values after the state changes.
  let version=0;
  const stateful=x=>(x^version)&7;
  const cached=prepareLowRankBatchInverter(stateful,{bits:3,rankBound:0});
  const original=cached.invert(5);
  assert.equal(original.preimage,5);
  assert.equal(stateful(original.preimage),5);
  version=1;
  const stale=cached.invert(5);
  assert.equal(stale.newOracleCalls,0);
  assert.equal(stale.preimage,5);
  assert.notEqual(stateful(stale.preimage),5,
    'state transition invalidates any earlier chosen-oracle memoization');
});
