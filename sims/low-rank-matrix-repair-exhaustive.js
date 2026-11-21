'use strict';

const assert=require('node:assert/strict');
const {repair,apply,createBasis}=require('./low-rank-affine-orbit-inversion.js');

/** @param {number[]} columns @returns {number} */
function rankByCompleteImage(columns){
  const images=new Set();
  const count=2**columns.length;
  for(let x=0;x<count;x++)images.add(apply(columns,x));
  return Math.log2(images.size);
}

/** @param {number} n */
function runWidth(n){
  let matrices=0;
  const byNullity=Array(n+1).fill(0);
  const byDifferenceRank=Array(n+1).fill(0);
  for(let encoding=0;encoding<2**(n*n);encoding++){
    const mask=(1<<n)-1;
    const columns=Array.from({length:n},(_,i)=>(encoding>>>(i*n))&mask);
    const originalRank=rankByCompleteImage(columns);
    const candidate=repair(columns);
    const d=n-originalRank;
    assert.equal(candidate.rank,originalRank);
    assert.equal(candidate.nullity,d);
    assert.equal(rankByCompleteImage(candidate.columns),n);
    const changed=candidate.columns.filter((v,i)=>v!==columns[i]).length;
    assert.equal(changed,d);
    const difference=candidate.columns.map((v,i)=>v^columns[i]);
    const diffRank=rankByCompleteImage(difference);
    assert.ok(diffRank<=d);
    const basis=createBasis(n);
    for(let i=0;i<n;i++)assert.equal(basis.add(candidate.columns[i],1<<i),true);
    for(let x=0;x<2**n;x++)assert.equal(basis.solve(apply(candidate.columns,x)),x);
    byNullity[d]++;
    byDifferenceRank[diffRank]++;
    matrices++;
  }
  return {n,matrices,byNullity,byDifferenceRank};
}

function main(){
  const results=[2,3,4].map(runWidth);
  console.log(JSON.stringify({results,allPassed:true}));
}

if(require.main===module)main();
module.exports={main,rankByCompleteImage};
