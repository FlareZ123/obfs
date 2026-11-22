'use strict';

const assert=require('node:assert/strict');
const {clone,evaluate}=require('./rankfour-projected-fourth-derivative-oracle-clone');
const {learnBoundedDegreeOracle,evaluateBoundedDegreeModel}=
  require('./bounded-degree-oracle-functional-clone');

/** @param {number} seed @returns {()=>number} */
function seeded(seed){
  let x=seed>>>0;
  return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;};
}
/** @param {number} x @returns {number} */
function parity(x){
  x^=x>>>16;x^=x>>>8;x^=x>>>4;x^=x>>>2;x^=x>>>1;return x&1;
}
/** @param {number[]} columns @param {number} input @returns {number} */
function apply(columns,input){
  let output=0;
  for(let i=0;i<columns.length;i++)if((input>>>i)&1)output^=columns[i];
  return output>>>0;
}
/** @param {number[]} columns @returns {number} */
function rank(columns){
  const pivot=Array(32).fill(0);let dimension=0;
  for(const column of columns){
    let word=column>>>0;
    for(let i=31;i>=0;i--){
      if(!((word>>>i)&1))continue;
      if(pivot[i])word=(word^pivot[i])>>>0;
      else{pivot[i]=word;dimension++;break;}
    }
  }
  return dimension;
}
/** @param {()=>number} draw @returns {number[]} */
function invertible(draw){
  const columns=Array.from({length:32},(_,i)=>(1<<i)>>>0);
  for(let i=0;i<384;i++){
    const a=draw()%32;let b=draw()%31;if(b>=a)b++;
    columns[a]=(columns[a]^columns[b])>>>0;
    if((draw()&3)===0){
      const tmp=columns[a];columns[a]=columns[b];columns[b]=tmp;
    }
  }
  assert.equal(rank(columns),32);
  return columns;
}

/**
 * Create a fixed hidden rank-four input-projected function for BOTH
 * learners, including truly noninjective source instances.
 * @param {()=>number} draw
 * @param {'quartic'|'lower'|'singular'|'affine'} kind
 * @returns {(x:number)=>number}
 */
function source(draw,kind){
  const A=invertible(draw);
  if(kind==='singular')A[0]=0;
  /** @type {number[]} */
  const V=[];
  while(V.length<4){
    let value=draw();
    if(kind==='singular')value&=0xfffffffe;
    if(rank([...V,value])===V.length+1)V.push(value>>>0);
  }
  const table=Array.from({length:16},()=>draw());
  if(kind==='affine'){
    const constant=draw(),linear=Array.from({length:4},()=>draw());
    for(let z=0;z<16;z++){
      let value=constant;
      for(let k=0;k<4;k++)if((z>>>k)&1)value^=linear[k];
      table[z]=value>>>0;
    }
  }else{
    let coef=0;
    for(const val of table)coef^=val;
    if(kind==='lower'){
      table[15]=(table[15]^coef)>>>0;
    }else if(coef===0){
      table[15]=(table[15]^1)>>>0;
    }
  }
  const constant=draw();
  /** @param {number} x @returns {number} */
  const F=x=>{
    const z=parity(V[0]&x)|(parity(V[1]&x)<<1)|
      (parity(V[2]&x)<<2)|(parity(V[3]&x)<<3);
    return (apply(A,x)^table[z]^constant)>>>0;
  };
  if(kind==='singular')assert.equal(F(0),F(1));
  return F;
}

/** @returns {object} */
function main(){
  const draw=seeded(0x92c72014);
  const kinds=/** @type {const} */ (['quartic','lower','singular','affine']);
  /** @type {Array<{kind:string,cases:number,specializedQueries:number[],genericQueries:number,matchedHeldouts:number}>} */
  const families=[];
  let testedCases=0,heldoutPerModel=0,fastSum=0,genericSum=0;
  let specializedMin=Infinity,specializedMax=0,quarticModels=0,lowerModels=0;
  for(const kind of kinds){
    /** @type {number[]} */
    const querySamples=[];
    let familyHeldout=0;
    for(let i=0;i<2;i++){
      const F=source(draw,kind);
      let liveSpecial=true,liveGeneric=true;
      /** @type {Set<number>} */
      const specialInputs=new Set();
      /** @type {Set<number>} */
      const genericInputs=new Set();
      const fast=clone(x=>{
        if(!liveSpecial)throw Error('Specialized rank-four oracle disabled');
        specialInputs.add(x>>>0);
        return F(x);
      },32,seeded((draw()^0x81a409b2)>>>0));
      liveSpecial=false;
      const generic=learnBoundedDegreeOracle(x=>{
        if(!liveGeneric)throw Error('Generic quartic oracle disabled');
        genericInputs.add(x>>>0);
        return F(x);
      },32,4);
      liveGeneric=false;
      assert.equal(fast.queries,specialInputs.size);
      assert.equal(generic.queryCount,genericInputs.size);
      assert.equal(generic.queryCount,41449);
      assert.ok(fast.queries<=2080);
      const fastModel=JSON.parse(JSON.stringify(fast));
      const genericModel=JSON.parse(JSON.stringify(generic));
      for(let j=0;j<128;j++){
        const x=draw();
        const expected=F(x);
        assert.equal(evaluate(fastModel,x),expected,
          'Specialized matched quartic output mismatch in '+kind);
        assert.equal(evaluateBoundedDegreeModel(genericModel,x),expected,
          'Generic matched quartic output mismatch in '+kind);
        familyHeldout++;
        heldoutPerModel++;
      }
      querySamples.push(fast.queries);
      fastSum+=fast.queries;genericSum+=generic.queryCount;
      specializedMin=Math.min(specializedMin,fast.queries);
      specializedMax=Math.max(specializedMax,fast.queries);
      if(fast.degree===4)quarticModels++;else lowerModels++;
      testedCases++;
    }
    families.push({kind,cases:2,specializedQueries:querySamples,
      genericQueries:41449,matchedHeldouts:familyHeldout});
  }
  assert.equal(testedCases,8);
  assert.equal(heldoutPerModel,1024);
  assert.ok(quarticModels>0&&lowerModels>0);
  const out={
    scope:'Same fixed 32-bit rank-four projected oracle and same heldouts for both full-function learners',
    testedCases,heldoutPerModel,
    specialized:{minQueries:specializedMin,maxQueries:specializedMax,
      totalQueries:fastSum,quarticBranchCases:quarticModels,
      quarticFreeBranchCases:lowerModels,
      confidenceQueryCap:2080},
    generic:{queriesPerCase:41449,totalQueries:genericSum},
    totalQuerySavings:genericSum-fastSum,
    familyCases:families,
    note:'Observed query counts only; no minifier protection, runtime overhead, or iid statistical validation'
  };
  console.log(JSON.stringify(out,null,2));
  return out;
}
if(require.main===module)main();
module.exports={main};
