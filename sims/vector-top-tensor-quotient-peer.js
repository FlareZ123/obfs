'use strict';
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
/** @param {number} seed @returns {()=>number} */
function seeded(seed){
  let index=0;
  return ()=>createHash('sha256').update(String(seed)+'/'+index++).digest().readUInt32BE(0);
}
/** @param {number} n @param {number} d @returns {number[][]} */
function combinations(n,d){
  /** @type {number[][]} */ const result=[];
  /** @param {number} start @param {number[]} path */
  function add(start,path){
    if(path.length===d){result.push(path);return;}
    for(let i=start;i<=n-(d-path.length);i++)add(i+1,path.concat(i));
  }
  add(0,[]);
  return result;
}
/** @param {number[]} rows @param {number} width @returns {number} */
function rank(rows,width){
  /** @type {number[]} */ const pivots=Array(width).fill(0);
  let count=0;
  for(let x of rows){
    for(let b=width-1;b>=0;b--){
      if(!((x>>>b)&1))continue;
      if(pivots[b])x^=pivots[b];
      else{pivots[b]=x;count++;break;}
    }
  }
  return count;
}
/**
 * The determinant is rank-d of the d-by-d GF2 matrix in row-major order.
 * @param {number[]} values @param {number[]} subset @returns {number}
 */
function determinant(values,subset){
  const rows=values.map(x=>subset.reduce((v,bit,i)=>v|(((x>>>bit)&1)<<i),0));
  return rank(rows,subset.length)===subset.length?1:0;
}
/**
 * @param {number[]} args
 * @param {number[][]} subsets
 * @param {number[]} grams
 * @returns {number}
 */
function form(args,subsets,grams){
  let result=0;
  for(let i=0;i<subsets.length;i++)if(determinant(args,subsets[i]))result^=grams[i];
  return result>>>0;
}
/** @param {bigint[]} values @returns {number} */
function gf2RankBig(values){
  /** @type {Map<number,bigint>} */ const pivots=new Map();
  let total=0;
  for(let x of values){
    while(x){
      const pivot=x.toString(2).length-1;
      const old=pivots.get(pivot);
      if(old!==undefined)x^=old;
      else{pivots.set(pivot,x);total++;break;}
    }
  }
  return total;
}
/** @param {bigint[]} values @returns {Map<string,number>} */
function coordinates(values){
  const map=new Map();
  for(let code=0;code<(1<<values.length);code++){
    let combined=0n;
    for(let j=0;j<values.length;j++)if((code>>>j)&1)combined^=values[j];
    map.set(combined.toString(),code);
  }
  return map;
}
/**
 * @param {number} d
 * @param {number} n
 * @param {number[]} gram
 * @param {()=>number} draw
 * @returns {{truthRank:number,witnesses:number,comparisonCount:number}}
 */
function verify(d,n,gram,draw){
  const subsets=combinations(n,d);
  /** @param {number[]} xs @returns {number} */
  const T=xs=>form(xs,subsets,gram);
  const radicalChecks=combinations(n,d-1).map(s=>s.map(i=>1<<i));
  const K=new Set();
  for(let x=0;x<(1<<n);x++)if(radicalChecks.every(xs=>T([x,...xs])===0))K.add(x);
  const trueRank=n-Math.log2(K.size);
  assert.ok(trueRank===d||trueRank===d+1);
  let comparisons=0,witnesses=0;
  for(let attempt=0;attempt<25;attempt++){
    const anchors=Array.from({length:d},()=>draw()&((1<<n)-1));
    const w=T(anchors);
    if(w===0)continue;
    witnesses++;
    /** @param {number} x @returns {bigint} */
    function signature(x){
      let result=0n;
      for(let omit=0;omit<d;omit++){
        const args=[x,...anchors.filter((_,i)=>i!==omit)];
        result^=BigInt(T(args))<<BigInt(32*omit);
      }
      return result;
    }
    const sigAnchors=anchors.map(signature);
    assert.equal(gf2RankBig(sigAnchors),d);
    const sigBasis=sigAnchors.slice();
    if(trueRank===d+1){
      const span=coordinates(sigBasis);
      let extra=-1;
      for(let j=0;j<n;j++)if(!span.has(signature(1<<j).toString())){
        extra=1<<j;break;
      }
      assert.notEqual(extra,-1);
      sigBasis.push(signature(extra));
    }
    const lookup=coordinates(sigBasis);
    assert.equal(lookup.size,1<<trueRank);
    for(let x=0;x<(1<<n);x++){
      const signatureValue=signature(x);
      assert.equal(signatureValue===0n,K.has(x));
      assert.ok(lookup.has(signatureValue.toString()));
    }
    // All Gram coefficients follow from the witness and at most one extra
    // input-basis pivot signature; no additional tensor queries.
    const gramSubsets=combinations(trueRank,d);
    const witnessGram=gramSubsets.map(s=>{
      if(s.length===d&&s.every(i=>i<d))return w;
      const missing=Array.from({length:d},(_,i)=>i).find(i=>!s.includes(i));
      assert.notEqual(missing,undefined);
      const value=sigBasis[d]>>BigInt(32*(/** @type {number} */ (missing)));
      return Number(value&0xffffffffn)>>>0;
    });
    for(let sample=0;sample<25;sample++){
      const args=Array.from({length:d},()=>draw()&((1<<n)-1));
      const coords=args.map(x=>{
        const result=lookup.get(signature(x).toString());
        assert.notEqual(result,undefined);
        return /** @type {number} */ (result);
      });
      assert.equal(form(coords,gramSubsets,witnessGram),T(args));
      comparisons++;
    }
  }
  assert.ok(witnesses>=2);
  return {truthRank:trueRank,witnesses,comparisonCount:comparisons};
}
/** @returns {object} */
function main(){
  const draw=seeded(0x56a72026);
  let sources=0,witnesses=0,comparisons=0,radicalD=0,radicalDPlusOne=0;
  for(let d=2;d<=4;d++)for(const n of [d,d+1]){
    for(let i=0;i<10;i++){
      const terms=combinations(n,d);
      let gram=terms.map(()=>draw()&((1<<n)-1));
      if(i%4===0){const common=(draw()&((1<<n)-1))||1;gram=terms.map(()=>common);}
      if(gram.reduce((a,b)=>a|b,0)===0)gram[0]=1;
      const record=verify(d,n,gram,draw);
      sources++;witnesses+=record.witnesses;comparisons+=record.comparisonCount;
      if(record.truthRank===d)radicalD++;
      else radicalDPlusOne++;
    }
  }
  assert.ok(radicalD>0&&radicalDPlusOne>0);
  const evidence={seed:'0x56a72026',dRange:[2,4],sources,witnesses,
    exactHeldoutTensorComparisons:comparisons,radicalD,radicalDPlusOne,
    note:'independent finite vector-valued tensor quotient signature and Gram reconstruction witness'};
  console.log('VECTOR_TOP_TENSOR_QUOTIENT_PEER '+JSON.stringify(evidence));
  return evidence;
}
if(require.main===module)main();
module.exports={main,verify};
