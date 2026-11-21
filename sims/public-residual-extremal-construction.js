'use strict';

const assert=require('node:assert/strict');
const {apply,span,kernel,invert,verifyStructure}=
  require('./public-residual-width5-6-independent');

/**
 * An explicit invertible input-basis construction for all r >= 4.
 * The r=3 base case has the independently checked six-column witness below.
 * @param {number} r
 * @returns {{high:number[],low:number[]}}
 */
function inputBasis(r){
  if(r===3){
    const witness=[45,55,17,28,62,35];
    return {
      high:witness.map(x=>x>>>r),
      low:witness.map(x=>x&((1<<r)-1))
    };
  }
  const high=[];
  const low=[];
  for(let i=0;i<r;i++){
    high.push(1<<i);
    low.push(1<<i);
  }
  for(let i=0;i<r;i++){
    const u=(1<<((i+1)%r))^(1<<((i+2)%r));
    high.push((1<<i)^u);
    low.push(u);
  }
  return {high,low};
}

/**
 * Construct the public permutation F on 2r bits, with
 * rank(M_F)=dim(kernel(M_F))=dim(R_F)=r.
 * @param {number} r
 * @returns {number[]}
 */
function construct(r){
  if(!Number.isInteger(r)||r<3||r>8){
    throw new RangeError('The finite reference supports r from 3 through 8');
  }
  const width=2*r;
  const side=1<<r;
  const domain=1<<width;
  const {high,low}=inputBasis(r);
  assert.equal(high.length,width);
  assert.equal(new Set(high).size,width);
  assert.equal(new Set(low).size,width);
  const columns=high.map((v,i)=>(v<<r)|low[i]);
  assert.equal(kernel(columns).length,1);
  const h=Array(side).fill(-1);
  h[0]=0;
  for(let i=0;i<width;i++){
    assert.equal(h[low[i]],-1);
    h[low[i]]=high[i];
  }
  const remaining=Array.from({length:side},(_,i)=>i).filter(x=>!h.includes(x));
  let cursor=0;
  for(let i=0;i<side;i++)if(h[i]<0)h[i]=remaining[cursor++];
  assert.equal(new Set(h).size,side);
  const values=Array.from({length:domain},(_,x)=>{
    const v=apply(columns,x);
    return (v&~(side-1))|h[v&(side-1)];
  });
  assert.equal(new Set(values).size,domain);
  return values;
}

/** @typedef {{r:number,width:number,oracleTargets:number,maxQueries:number,maxRepairs:number,maxExpansions:number}} Row */

/**
 * Reproduce the exact linear/nullity/residual-rank identities and chosen
 * target inversion bounds. Fully exhaust targets up to 10-bit words.
 * @returns {{totalTargets:number,cases:Row[]}}
 */
function run(){
  /** @type {Row[]} */
  const cases=[];
  let totalTargets=0;
  for(let r=3;r<=8;r++){
    const width=2*r;
    const domain=1<<width;
    const side=1<<r;
    const values=construct(r);
    const constant=values[0];
    const linear=Array.from({length:width},(_,i)=>values[1<<i]^constant);
    assert.equal(kernel(linear).length,side);
    const residuals=values.map((v,x)=>v^constant^apply(linear,x));
    assert.equal(span(residuals).size,side);
    if(r<=5)assert.equal(verifyStructure(values).r,r);
    const oracleTargets=r<=5?domain:r===6?32:r===7?8:2;
    let maxQueries=0,maxRepairs=0,maxExpansions=0;
    for(let i=0;i<oracleTargets;i++){
      const source=(i*997)%domain;
      const observed=invert(values,values[source]);
      assert.equal(observed.recovered,source);
      assert.equal(observed.repairs,r);
      assert.ok(observed.queries<=width+2**(r+1));
      maxQueries=Math.max(maxQueries,observed.queries);
      maxRepairs=Math.max(maxRepairs,observed.repairs);
      maxExpansions=Math.max(maxExpansions,observed.expansions);
    }
    totalTargets+=oracleTargets;
    cases.push({r,width,oracleTargets,maxQueries,maxRepairs,maxExpansions});
  }
  return {totalTargets,cases};
}

if(require.main===module)process.stdout.write(JSON.stringify(run(),null,2)+'\n');
module.exports={construct,run};
