'use strict';
const assert=require('node:assert/strict');

/** @param {number} value @returns {number} */
function parity(value){
  let x=value>>>0;
  x^=x>>>16;x^=x>>>8;x^=x>>>4;x^=x>>>2;x^=x>>>1;
  return x&1;
}
/** @param {number} seed @returns {()=>number} */
function random(seed){let x=seed>>>0;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;};}
/** @param {number[]} columns @param {number} x @returns {number} */
function apply(columns,x){let v=0;for(let i=0;i<columns.length;i++)if((x>>>i)&1)v^=columns[i];return v>>>0;}
/** @param {bigint} x @returns {number} */
function topBit(x){let value=x,bit=-1;while(value){value>>=1n;bit++;}return bit;}
/**
 * @param {(x:number)=>number} oracle A promised degree<=2 full oracle
 * @param {number} n
 * @param {number} maxProjectionRank
 * @returns {{evaluate:(x:number)=>number,queries:number,early:boolean,rank:number,pivots:number}}
 */
function cloneQuadratic(oracle,n,maxProjectionRank=3){
  /** @type {Map<number,number>} */
  const cache=new Map();
  /** @param {number} x @returns {number} */
  const ask=x=>{
    const k=x>>>0;
    if(!cache.has(k))cache.set(k,oracle(k)>>>0);
    return /** @type {number} */ (cache.get(k));
  };
  const base=ask(0);
  const linear=Array.from({length:n},(_,i)=>(ask((1<<i)>>>0)^base)>>>0);
  /** @type {number[][]} */
  const pair=Array.from({length:n},()=>Array(n).fill(0));
  /** @param {number} i @param {number} j @returns {number} */
  const coefficient=(i,j)=>{
    if(i===j)return 0;
    return (ask(((1<<i)^(1<<j))>>>0)^linear[i]^linear[j]^base)>>>0;
  };
  let observedRank=0;
  for(let pivot=0;pivot<n;pivot++){
    for(let i=pivot+1;i<n;i++){
      const v=coefficient(i,pivot);
      pair[i][pivot]=v;pair[pivot][i]=v;
    }
    const signatures=Array.from({length:n},(_,i)=>{
      let s=0n;
      for(let j=0;j<=pivot;j++)s|=BigInt(pair[i][j])<<BigInt(32*j);
      return s;
    });
    /** @type {Map<number,bigint>} */
    const basis=new Map();
    /** @type {number[]} */
    const selected=[];
    for(let i=0;i<n;i++){
      let v=signatures[i];
      while(v){
        const bit=topBit(v);
        const old=basis.get(bit);
        if(old!==undefined)v^=old;
        else{basis.set(bit,v);selected.push(i);break;}
      }
    }
    observedRank=selected.length;
    if(selected.length>maxProjectionRank)throw new Error('Projection-rank promise violated');
    if(selected.length!==maxProjectionRank)continue;
    const width=1<<maxProjectionRank;
    const combinations=Array.from({length:width},(_,mask)=>{
      let v=0n;
      for(let j=0;j<selected.length;j++)if(mask&(1<<j))v^=signatures[selected[j]];
      return v;
    });
    const coords=signatures.map(value=>{
      const x=combinations.findIndex(c=>c===value);
      assert.ok(x>=0);
      return x;
    });
    const outputPair=Array.from({length:maxProjectionRank},()=>Array(maxProjectionRank).fill(0));
    for(let i=0;i<maxProjectionRank;i++)for(let j=i+1;j<maxProjectionRank;j++){
      const value=coefficient(selected[i],selected[j]);
      outputPair[i][j]=value;outputPair[j][i]=value;
    }
    /** @param {number} z @returns {number} */
    const quadratic=z=>{
      let out=0;
      for(let i=0;i<maxProjectionRank;i++)for(let j=i+1;j<maxProjectionRank;j++){
        if((z&(1<<i))&&(z&(1<<j)))out^=outputPair[i][j];
      }
      return out>>>0;
    };
    const adjusted=linear.map((value,i)=>(value^quadratic(coords[i]))>>>0);
    return {
      early:true,rank:selected.length,pivots:pivot+1,queries:cache.size,
      evaluate:x=>{
        let v=base,z=0;
        for(let i=0;i<n;i++)if((x>>>i)&1){v^=adjusted[i];z^=coords[i];}
        return (v^quadratic(z))>>>0;
      }
    };
  }
  return {
    early:false,rank:observedRank,pivots:n,queries:cache.size,
    evaluate:x=>{
      let v=base;
      for(let i=0;i<n;i++)if((x>>>i)&1){
        v^=linear[i];
        for(let j=0;j<i;j++)if((x>>>j)&1)v^=pair[i][j];
      }
      return v>>>0;
    }
  };
}

/** @param {number} r @param {()=>number} next @returns {(x:number)=>number} */
function randomQuadratic(r,next){
  /** @type {number[]} */
  const masks=[];
  while(masks.length<r){
    const candidate=next();
    const seen=new Set([0]);
    for(let i=1;i<(1<<masks.length);i++){
      let x=0;for(let j=0;j<masks.length;j++)if(i&(1<<j))x^=masks[j];
      seen.add(x>>>0);
    }
    if(!seen.has(candidate))masks.push(candidate);
  }
  const affine=Array.from({length:32},()=>next());
  const table=Array.from({length:8},()=>next());
  let cubic=0;for(let i=0;i<7;i++)cubic^=table[i];
  table[7]=cubic>>>0;
  const constant=next();
  return x=>{
    let proj=0;
    for(let i=0;i<r;i++)proj|=parity(masks[i]&x)<<i;
    return (constant^apply(affine,x)^table[proj])>>>0;
  };
}
function main(){
  let smallCases=0,smallOutputs=0,smallEarly=0;
  for(let b01=0;b01<8;b01++)for(let b02=0;b02<8;b02++)for(let b12=0;b12<8;b12++){
    /** @param {number} x @returns {number} */
    const quadratic=x=>{
      let v=5;
      if((x&3)===3)v^=b01;
      if((x&5)===5)v^=b02;
      if((x&6)===6)v^=b12;
      return v>>>0;
    };
    let online=true;
    const clone=cloneQuadratic(x=>{if(!online)throw Error('Oracle called after training');return quadratic(x);},3,3);
    online=false;
    for(let x=0;x<8;x++){assert.equal(clone.evaluate(x),quadratic(x));smallOutputs++;}
    if(clone.early)smallEarly++;
    smallCases++;
  }
  const next=random(0x65a2f11);
  let cases=0,targets=0,early=0,maxQueries=0,maxPivots=0;
  /** @type {number[]} */
  const rankThreeCosts=[];
  /** @type {Array<{r:number,cases:number,early:number,maxQueries:number}>} */
  const byRank=[];
  for(const r of [2,3]){
    let rankEarly=0,rankMax=0;
    for(let i=0;i<96;i++){
      const oracle=randomQuadratic(r,next);
      let online=true;
      const clone=cloneQuadratic(x=>{if(!online)throw Error('Oracle called after training');return oracle(x);},32,3);
      online=false;
      for(let j=0;j<128;j++){
        const x=next();
        assert.equal(clone.evaluate(x),oracle(x));
        targets++;
      }
      assert.ok(clone.queries<=529);
      if(clone.early){rankEarly++;early++;}
      if(r===3)rankThreeCosts.push(clone.queries);
      maxQueries=Math.max(maxQueries,clone.queries);
      rankMax=Math.max(rankMax,clone.queries);
      maxPivots=Math.max(maxPivots,clone.pivots);
      cases++;
    }
    byRank.push({r,cases:96,early:rankEarly,maxQueries:rankMax});
  }
  rankThreeCosts.sort((a,b)=>a-b);
  const medianThree=rankThreeCosts[rankThreeCosts.length/2];
  const meanThree=rankThreeCosts.reduce((a,b)=>a+b,0)/rankThreeCosts.length;
  const summary={width3:{cases:smallCases,outputsChecked:smallOutputs,early:smallEarly},width32:{cases,heldoutOutputs:targets,early,maxQueries,maxPivots,byRank,rankThreeQueryMedian:medianThree,rankThreeQueryMean:meanThree},seed:'0x65a2f11'};
  console.log('RANKTHREE_QUADRATIC_SHORTCUT '+JSON.stringify(summary));
  return summary;
}
if(require.main===module)main();
module.exports={cloneQuadratic,main};
