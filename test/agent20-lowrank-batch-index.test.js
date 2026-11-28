'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prepareLowRankBatchInverter}=require('../sims/agent20-lowrank-batch-index');

const bits=8;
const innerColumns=[1<<7,1<<2,1<<4,1<<0,1<<6,1<<1,1<<5,1<<3];
/** @param {number} input @param {number[]} columns @returns {number} */
function linear(input,columns) {
  let out=0;
  for(let i=0;i<columns.length;i++)if((input>>>i)&1)out^=columns[i];
  return out&255;
}
/** @param {number} hidden @returns {number} */
function depermute(hidden) {
  let input=0;
  for(let i=0;i<bits;i++)if(hidden&innerColumns[i])input|=(1<<i);
  return input;
}
/** @param {number} input @returns {number} */
function outer(input) {
  let x=input&255;
  x^=(x<<3)&255;
  x^=x>>>5;
  x^=(x<<1)&255;
  return x&255;
}
/** @param {number[]} p @returns {(input:number)=>number} */
function wrapped(p) {
  return input=>{
    const hidden=linear(input,innerColumns);
    const moved=(hidden&240)|p[hidden&15];
    return (outer(moved)^0x6d)&255;
  };
}
const longCycle=[3,5,6,7,9,10,11,12,13,14,15];
const first=Array.from({length:16},(_,i)=>i);
longCycle.forEach((x,i)=>{first[x]=longCycle[(i+1)%longCycle.length];});
const second=Array(16).fill(-1);
for(const [a,b] of [[0,0],[1,3],[2,5],[4,6],[8,8]])second[a]=b;
const unusedOutputs=Array.from({length:16},(_,x)=>x).filter(x=>!second.includes(x));
Array.from({length:16},(_,x)=>x).filter(x=>second[x]<0).forEach((x,i)=>{second[x]=unusedOutputs[i];});
/** @param {number[]} permutation @returns {number} */
function residualRank(permutation) {
  const c=permutation[0];
  const cols=Array.from({length:8},(_,i)=>permutation[1<<i]^c);
  /** @param {number} x */
  const apply=x=>linear(x,cols);
  const basis=Array(8).fill(0);
  let r=0;
  for(let x=0;x<256;x++) {
    let v=permutation[x]^c^apply(x);
    for(let bit=7;bit>=0;bit--) {
      if(!((v>>>bit)&1))continue;
      if(basis[bit])v^=basis[bit];
      else {basis[bit]=v;r++;break;}
    }
  }
  return r;
}
/** @param {(x:number)=>number} oracle @returns {number[]} */
function table(oracle){return Array.from({length:256},(_,x)=>oracle(x));}
/** @param {number} h @returns {number[]} */
function group(h){return Array.from({length:16},(_,low)=>depermute((h<<4)|low));}

test('two 16-state U-cosets amortize 32 exact inversions to one pass per cycle',()=>{
  const F=wrapped(first);
  const images=table(F);
  assert.equal(new Set(images).size,256);
  assert.equal(residualRank(images),4,'private verifier: true public residual rank');
  const attacker=prepareLowRankBatchInverter(F,{bits:8,rankBound:4});
  assert.equal(attacker.stats().setupCalls,9);
  assert.equal(attacker.stats().interpolantNullity,0);
  const secrets=[...group(10),...group(11)];
  const targets=secrets.map(F); // challenge generation, NOT charged to the attacker
  const receipts=targets.map((y,i)=>{
    const result=attacker.invert(y);
    assert.equal(result.preimage,secrets[i]);
    return result;
  });
  const s=attacker.stats();
  assert.equal(s.targets,32);
  assert.equal(s.totalCalls,41,'9 basis calls + exactly 32 union-cycle calls');
  assert.equal(receipts.reduce((sum,r)=>sum+r.newOracleCalls,0),32);
  assert.equal(s.scannedCycles,12,'1 eleven-cycle and 5 fixed cycles per coset');
  assert.equal(s.cacheHits,20);
  const repeated=targets.map(y=>attacker.invert(y));
  assert.equal(repeated.every(r=>!r.cycleScanned&&r.newOracleCalls===0),true);
  assert.equal(attacker.stats().totalCalls,41);

  // Fair per-target control: each original solver redoes its interpolation
  // and cycle work rather than reusing the same fixed deterministic oracle.
  let unsharedCalls=0;
  for(const y of targets){
    const fresh=prepareLowRankBatchInverter(F,{bits:8,rankBound:4});
    fresh.invert(y);
    unsharedCalls+=fresh.stats().totalCalls;
  }
  assert.equal(unsharedCalls,540);
  assert.equal(s.totalCalls<unsharedCalls,true);
});

test('singular affine interpolant still permits exact cross-target cache reuse',()=>{
  const F=wrapped(second);
  const images=table(F);
  assert.equal(new Set(images).size,256);
  assert.equal(residualRank(images)<=4,true);
  const attacker=prepareLowRankBatchInverter(F,{bits:8,rankBound:4});
  assert.equal(attacker.stats().interpolantNullity,1);
  const secrets=group(10);
  const targets=secrets.map(F);
  for(let i=0;i<targets.length;i++){
    const result=attacker.invert(targets[i]);
    assert.equal(result.preimage,secrets[i]);
  }
  assert.ok(attacker.stats().totalCalls<=9+32);
  assert.equal(targets.every(y=>attacker.invert(y).newOracleCalls===0),true);
});

test('sampled residual completion reduces singular batch orbit bound from 32 to 16',()=>{
  const F=wrapped(second);
  let draws=0;
  const attacker=prepareLowRankBatchInverter(F,{
    bits:8,rankBound:4,completion:'sampled-residual',
    sample:()=>((draws++*73+19)&255),maxSamples:256
  });
  assert.equal(attacker.stats().interpolantNullity,1);
  assert.equal(attacker.stats().orbitCap,16);
  assert.equal(attacker.stats().completion,'sampled-residual');
  assert.equal(attacker.stats().samplingCalls,draws);
  const secrets=group(10),targets=secrets.map(F);
  for(let i=0;i<targets.length;i++)
    assert.equal(attacker.invert(targets[i]).preimage,secrets[i]);
  const stats=attacker.stats();
  assert.ok(stats.totalCalls<=9+stats.samplingCalls+16);
  assert.equal(targets.every(y=>attacker.invert(y).newOracleCalls===0),true);
  assert.throws(()=>prepareLowRankBatchInverter(F,{
    bits:8,rankBound:4,completion:'sampled-residual',
    sample:()=>0,maxSamples:3
  }),/Uniform residual-completion samples exhausted/u);
  assert.throws(()=>prepareLowRankBatchInverter(F,{
    bits:8,rankBound:4,completion:'sampled-residual',sample:()=>-1
  }),/Sample outside n-bit domain/u);
});

test('promised rank and orbit cap are enforced, not silently declared successes',()=>{
  const F=wrapped(first),y=F(group(10)[3]);
  assert.throws(()=>prepareLowRankBatchInverter(F,{bits:8,rankBound:-1}),RangeError);
  assert.throws(()=>prepareLowRankBatchInverter(F,{bits:8,rankBound:4,maxOrbitCalls:0}),RangeError);
  const tooSmall=prepareLowRankBatchInverter(F,{bits:8,rankBound:1});
  assert.throws(()=>tooSmall.invert(y),/Orbit cap or rank promise/u);
  const capped=prepareLowRankBatchInverter(F,{bits:8,rankBound:4,maxOrbitCalls:1});
  assert.throws(()=>capped.invert(y),/Orbit cap or rank promise/u);
  assert.throws(()=>capped.invert(256),RangeError);
});

test('all 40,320 width-three permutations admit complete eight-target batch indexing',()=>{
  const perm=Array.from({length:8},(_,i)=>i);
  let families=0,targets=0,maxCalls=0;
  /** @param {number} at */
  function enumerate(at) {
    if(at===perm.length) {
      const attacker=prepareLowRankBatchInverter(x=>perm[x],{bits:3,rankBound:3});
      let next=0;
      const sampled=prepareLowRankBatchInverter(x=>perm[x],{
        bits:3,rankBound:3,completion:'sampled-residual',
        sample:()=>next++&7,maxSamples:8
      });
      for(let y=0;y<8;y++) {
        const inverse=attacker.invert(y);
        const sampledInverse=sampled.invert(y);
        assert.equal(perm[inverse.preimage],y);
        assert.equal(sampledInverse.preimage,inverse.preimage);
        targets++;
      }
      const stats=attacker.stats();
      assert.equal(stats.totalCalls,8,'every oracle input visited exactly once');
      assert.equal(sampled.stats().totalCalls,8,'sampled completion finds full map');
      maxCalls=Math.max(maxCalls,stats.totalCalls);
      families++;
      return;
    }
    for(let i=at;i<perm.length;i++) {
      [perm[i],perm[at]]=[perm[at],perm[i]];
      enumerate(at+1);
      [perm[i],perm[at]]=[perm[at],perm[i]];
    }
  }
  enumerate(0);
  assert.equal(families,40320);
  assert.equal(targets,322560);
  assert.equal(maxCalls,8);
});
