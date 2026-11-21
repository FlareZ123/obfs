'use strict';
const assert=require('node:assert/strict');
const {constructInverter,rank,applyLinear}=
  require('./low-rank-orbit-independent-review');

/** @param {number} seed @returns {()=>number} */
function random(seed){
  let s=seed>>>0;
  return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return s>>>0;};
}
/** @param {number} n @returns {number[]} */
function identity(n){return Array.from({length:n},(_,i)=>(1<<i)>>>0);}
/** @param {number} n @param {()=>number} next @returns {number[]} */
function invertible(n,next){
  const result=identity(n);
  for(let t=0;t<8*n;t++){
    let a=next()%n,b=next()%n;
    if(a===b)continue;
    if(next()&1)result[a]=(result[a]^result[b])>>>0;
    else [result[a],result[b]]=[result[b],result[a]];
  }
  assert.equal(rank(result),n);
  return result;
}
/** @param {number[]} values @returns {number[][]} */
function permutations(values){
  if(!values.length)return [[]];
  /** @type {number[][]} */
  const out=[];
  for(let j=0;j<values.length;j++){
    const remaining=values.filter((_,i)=>i!==j);
    for(const tail of permutations(remaining))out.push([values[j],...tail]);
  }
  return out;
}
/** @param {number[]} table @param {number} bits @returns {number} */
function intrinsicResidualRank(table,bits){
  const base=table[0];
  const linear=identity(bits).map(x=>(table[x]^base)>>>0);
  return rank(table.map((value,x)=>(value^base^applyLinear(linear,x))>>>0));
}
/** @param {number} r @param {()=>number} next @returns {{oracle:(x:number)=>number,baseRank:number,residualBasis:number[],affineColumns:number[],constant:number}} */
function singularAffineOracle(r,next){
  const left=invertible(32,next);
  const right=invertible(32,next);
  const constant=next();
  const lowMask=(1<<r)-1;
  const affineColumns=left.map(column=>applyLinear(right,(column&~lowMask)>>>0));
  const residualBasis=identity(r).map(w=>applyLinear(right,w));
  assert.equal(rank(affineColumns),32-r);
  assert.equal(rank(residualBasis),r);
  /** @param {number} x @returns {number} */
  const oracle=x=>{
    const input=applyLinear(left,x);
    const upper=input>>>r;
    let delta=0;
    for(let bit=0;bit<r;bit++){
      const a=(upper>>>(2*bit))&1;
      const b=(upper>>>(2*bit+1))&1;
      delta|=(a&b)<<bit;
    }
    return (applyLinear(right,(input^delta)>>>0)^constant)>>>0;
  };
  return {oracle,baseRank:rank(affineColumns),residualBasis,
    affineColumns,constant};
}
function main(){
  const counts=Array(4).fill(0);
  let tinyTargets=0,tinyMaxQueries=0,tinyMaxSteps=0;
  for(const table of permutations(identity(8).map((_,i)=>i))){
    const r=intrinsicResidualRank(table,3);
    counts[r]++;
    for(let secret=0;secret<8;secret++){
      const model=constructInverter(x=>table[x],3,r);
      const answer=model.invert(table[secret]);
      assert.equal(answer.input,secret);
      assert.ok(model.nullity<=r);
      assert.ok(model.queries()<=4+2**Math.min(3,2*r));
      tinyMaxQueries=Math.max(tinyMaxQueries,model.queries());
      tinyMaxSteps=Math.max(tinyMaxSteps,answer.steps);
      tinyTargets++;
    }
  }
  assert.deepEqual(counts,[1344,9408,18816,10752]);
  assert.equal(tinyTargets,322560);
  const next=random(0x6a640626);
  /** @type {Array<{r:number,oracles:number,targets:number,maxQueries:number,maxSteps:number,maxNullity:number,affineBaseRank:number}>} */
  const samples=[];
  for(const r of [2,3,4,5]){
    let targets=0,maxQueries=0,maxSteps=0,maxNullity=0;
    for(let i=0;i<96;i++){
      const model=singularAffineOracle(r,next);
      assert.equal(model.baseRank,32-r);
      // Each affine base A is genuinely singular; the entire F is bijective.
      // Every residual is in the known r-dimensional output span W.
      for(let j=0;j<64;j++){
        const x=next();
        const residual=(model.oracle(x)^model.constant^
          applyLinear(model.affineColumns,x))>>>0;
        assert.equal(rank([...model.residualBasis,residual]),r);
      }
      for(let j=0;j<8;j++){
        const secret=next();
        const inversion=constructInverter(model.oracle,32,r);
        const answer=inversion.invert(model.oracle(secret));
        assert.equal(answer.input,secret);
        assert.ok(inversion.nullity<=r);
        assert.ok(inversion.queries()<=33+2**Math.min(32,2*r));
        maxQueries=Math.max(maxQueries,inversion.queries());
        maxSteps=Math.max(maxSteps,answer.steps);
        maxNullity=Math.max(maxNullity,inversion.nullity);
        targets++;
      }
    }
    samples.push({r,oracles:96,targets,maxQueries,maxSteps,maxNullity,
      affineBaseRank:32-r});
  }
  const result={width3:{permutations:40320,intrinsicResidualRanks:counts,
    targetInversions:tinyTargets,maxQueries:tinyMaxQueries,maxSteps:tinyMaxSteps},
    width32:samples,seed:'0x6a640626',
    claim:'Permutation and low output-affine-quotient rank suffice, even if original affine base is singular'};
  console.log('SINGULAR_AFFINE_BASE_LOW_RANK_INVERSION '+JSON.stringify(result));
  return result;
}
if(require.main===module)main();
module.exports={intrinsicResidualRank,singularAffineOracle,main};
