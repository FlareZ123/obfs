'use strict';
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');

/** @typedef {{bits:number,base:Map<number,number>,quartic:Array<[number,number]>,degree:3|4,queries:number,trials:number,quotientRank:number}} Model */

/** @param {number} seed @returns {()=>number} */
function seeded(seed){
  let i=0;
  return ()=>createHash('sha256').update(String(seed)+'/'+i++).digest().readUInt32BE(0);
}
/** @param {number} n @param {number} weight @returns {number[]} */
function masks(n,weight){
  /** @type {number[]} */ const result=[];
  /** @param {number} from @param {number} left @param {number} value */
  function go(from,left,value){
    if(left===0){result.push(value>>>0);return;}
    for(let b=from;b<=n-left;b++)go(b+1,left-1,value^(1<<b));
  }
  go(0,weight,0);
  return result;
}
/** @param {number[]} rows @param {number} width @returns {number} */
function rank(rows,width){
  const pivots=Array(width).fill(0);
  let count=0;
  for(let row of rows){
    for(let bit=width-1;bit>=0;bit--){
      if(!((row>>>bit)&1))continue;
      if(pivots[bit])row^=pivots[bit];
      else{pivots[bit]=row;count++;break;}
    }
  }
  return count;
}
/**
 * @param {number[]} vectors
 * @param {number[]} indices
 * @returns {number}
 */
function det(vectors,indices){
  const projected=vectors.map(x=>indices.reduce((v,bit,i)=>
    v|(((x>>>bit)&1)<<i),0));
  return rank(projected,indices.length)===indices.length?1:0;
}
/** @param {number[]} coords @param {number[]} grams @param {number} k @returns {number} */
function polar(coords,grams,k){
  const basisMasks=masks(k,4);
  let result=0;
  for(let i=0;i<basisMasks.length;i++){
    const indices=Array.from({length:k},(_,j)=>j).filter(j=>(basisMasks[i]>>>j)&1);
    if(det(coords,indices))result^=grams[i];
  }
  return result>>>0;
}
/** @param {bigint[]} signatureBasis @returns {Map<string,number>} */
function coordinateTable(signatureBasis){
  const m=new Map();
  for(let bits=0;bits<(1<<signatureBasis.length);bits++){
    let v=0n;
    for(let j=0;j<signatureBasis.length;j++)if((bits>>>j)&1)v^=signatureBasis[j];
    m.set(v.toString(),bits);
  }
  return m;
}
/**
 * Full function clone for a fixed degree<=4 vector-valued Boolean F whose
 * fourth alternating derivative has joint radical codimension <=5.
 * Lower cubic and quadratic pieces may have arbitrary input rank.
 *
 * @param {(x:number)=>number} oracle
 * @param {number} n
 * @param {()=>number} draw Independent uniform uint32 words for the theorem.
 * @param {number} [delta]
 * @returns {Model}
 */
function clone(oracle,n,draw,delta=1e-10){
  assert.ok(Number.isInteger(n)&&n>=4&&n<=32);
  assert.ok(Number.isFinite(delta)&&delta>0&&delta<1);
  const mask=n===32?0xffffffff:2**n-1;
  /** @type {Map<number,number>} */
  const cache=new Map();
  /** @param {number} x @returns {number} */
  function ask(x){
    const key=(x&mask)>>>0;
    if(!cache.has(key))cache.set(key,oracle(key)>>>0);
    return /** @type {number} */ (cache.get(key));
  }
  // The degree-four homogeneous part vanishes on every weight<=3 mask,
  // hence generic lower-degree ANF coefficients can be obtained first.
  /** @type {Map<number,number>} */
  const base=new Map();
  for(let weight=0;weight<=3;weight++){
    for(const x of masks(n,weight)){
      let coefficient=ask(x);
      for(let subset=(x-1)&x;subset!==x;subset=(subset-1)&x){
        coefficient^=/** @type {number} */ (base.get(subset>>>0));
        if(subset===0)break;
      }
      base.set(x>>>0,coefficient>>>0);
    }
  }
  /** @param {number[]} args @returns {number} */
  function T(args){
    let output=0;
    for(let bits=0;bits<16;bits++){
      let input=0;
      for(let j=0;j<4;j++)if((bits>>>j)&1)input^=args[j];
      output^=ask(input>>>0);
    }
    return output>>>0;
  }
  const trialsCap=Math.ceil(Math.log(delta)/Math.log(1-315/1024));
  /** @type {number[]} */
  let anchors=[];
  let w=0,trials=0;
  for(;trials<trialsCap;trials++){
    const tuple=Array.from({length:4},()=>draw()&mask);
    const witness=T(tuple);
    if(witness){
      anchors=tuple;w=witness;trials++;break;
    }
  }
  if(!w)return {bits:n,base,quartic:[],degree:3,queries:cache.size,
    trials,quotientRank:0};
  /** @param {number} x @returns {bigint} */
  function signature(x){
    let packed=0n;
    for(let omit=0;omit<4;omit++){
      const args=[x,...anchors.filter((_,j)=>j!==omit)];
      packed^=BigInt(T(args))<<BigInt(32*omit);
    }
    return packed;
  }
  const witnessBasis=Array.from({length:4},(_,i)=>BigInt(w)<<BigInt(32*i));
  const observed=Array.from({length:n},(_,i)=>signature((1<<i)>>>0));
  const known=coordinateTable(witnessBasis);
  const extraIndex=observed.findIndex(s=>!known.has(s.toString()));
  /** @type {bigint[]} */
  const signatureBasis=witnessBasis.slice();
  if(extraIndex>=0)signatureBasis.push(observed[extraIndex]);
  assert.ok(signatureBasis.length===4||signatureBasis.length===5);
  const lookup=coordinateTable(signatureBasis);
  assert.equal(lookup.size,1<<signatureBasis.length);
  const coordinates=observed.map(s=>{
    const v=lookup.get(s.toString());
    assert.notEqual(v,undefined);
    return /** @type {number} */ (v);
  });
  const k=signatureBasis.length;
  const gramMasks=masks(k,4);
  const grams=gramMasks.map(subset=>{
    if(subset===15)return w;
    assert.equal(k,5);
    const omitted=[0,1,2,3].find(j=>!((subset>>>j)&1));
    assert.notEqual(omitted,undefined);
    return Number((signatureBasis[4]>>BigInt(32*(/** @type {number} */ (omitted))))&0xffffffffn)>>>0;
  });
  /** @type {Array<[number,number]>} */
  const quartic=[];
  for(const sourceMask of masks(n,4)){
    const c=Array.from({length:n},(_,i)=>i)
      .filter(i=>(sourceMask>>>i)&1).map(i=>coordinates[i]);
    const value=polar(c,grams,k);
    if(value)quartic.push([sourceMask,value]);
  }
  const allowed=masks(n,0).length+masks(n,1).length+
    masks(n,2).length+masks(n,3).length+
    15*trialsCap+14*n;
  assert.ok(cache.size<=allowed,'Full quartic reconstruction exceeds source-family call budget');
  return {bits:n,base,quartic,degree:4,queries:cache.size,
    trials,quotientRank:k};
}
/** @param {Model} model @param {number} x @returns {number} */
function evaluate(model,x){
  let value=0;
  for(const [subset,coefficient] of model.base){
    if(((x&subset)>>>0)===subset)value^=coefficient;
  }
  for(const [subset,coefficient] of model.quartic){
    if(((x&subset)>>>0)===subset)value^=coefficient;
  }
  return value>>>0;
}
/** @param {number} x @returns {number} */
function parity(x){
  x^=x>>>16;x^=x>>>8;x^=x>>>4;x^=x>>>2;x^=x>>>1;
  return x&1;
}
/** @param {number[]} cols @param {number} x @returns {number} */
function linear(cols,x){
  let result=0;
  for(let j=0;j<cols.length;j++)if((x>>>j)&1)result^=cols[j];
  return result>>>0;
}
/** @param {number} n @param {()=>number} draw @param {boolean} quarticActive @returns {(x:number)=>number} */
function source(n,draw,quarticActive){
  const mask=n===32?0xffffffff:2**n-1;
  const affine=Array.from({length:n},()=>draw()&mask);
  const cubicTerms=Array.from({length:64},()=>({
    a:draw()%n,b:draw()%n,c:draw()%n,value:draw()&mask
  }));
  const quadraticTerms=Array.from({length:64},()=>({
    a:draw()%n,b:draw()%n,value:draw()&mask
  }));
  /** @type {number[]} */
  const projections=[];
  while(projections.length<5){
    const next=draw()&mask;
    if(rank([...projections,next],n)>projections.length)projections.push(next);
  }
  const outputs=quarticActive?[draw()&mask,draw()&mask,draw()&mask,draw()&mask,draw()&mask]:
    [0,0,0,0,0];
  if(quarticActive&&outputs.reduce((x,y)=>x|y,0)===0)outputs[0]=1;
  const offset=draw()&mask;
  return x=>{
    let value=offset^linear(affine,x);
    for(const term of cubicTerms)
      if((x>>>term.a&1)&&(x>>>term.b&1)&&(x>>>term.c&1))value^=term.value;
    for(const term of quadraticTerms)
      if((x>>>term.a&1)&&(x>>>term.b&1))value^=term.value;
    const z=projections.map(p=>parity(x&p));
    for(let omitted=0;omitted<5;omitted++){
      let active=1;
      for(let i=0;i<5;i++)if(i!==omitted)active&=z[i];
      if(active)value^=outputs[omitted];
    }
    return (value&mask)>>>0;
  };
}
/** @returns {object} */
function main(){
  const draw=seeded(0x4a202611);
  let cases=0,outputs=0,quartic=0,cubic=0,maxQueries=0;
  const perWidth=[];
  for(let n=5;n<=7;n++){
    let attempts=0;
    for(let c=0;c<12;c++){
      const F=source(n,draw,c%4!==0);
      let online=true,calls=0;
      const m=clone(x=>{
        if(!online)throw Error('Offline finite model requested protected function');
        calls++;return F(x);
      },n,seeded(draw()));
      online=false;
      assert.equal(calls,m.queries);
      const restored=/** @type {Model} */(JSON.parse(JSON.stringify({
        ...m,base:Array.from(m.base.entries())
      }),(_key,value)=>value));
      // JSON converts Map to an array, restore it before evaluating.
      restored.base=new Map(restored.base);
      for(let x=0;x<(1<<n);x++){
        assert.equal(evaluate(restored,x),F(x),'finite mismatch n='+n+', case='+c+', x='+x);
        outputs++;
      }
      if(m.degree===4)quartic++;else cubic++;
      cases++;attempts++;
      maxQueries=Math.max(maxQueries,calls);
    }
    perWidth.push({n,attempts});
  }
  const N=32;
  let wide=0,wideHeldouts=0,wideMaximum=0;
  for(let i=0;i<8;i++){
    const F=source(N,draw,i%3!==0);
    let online=true,calls=0;
    const m=clone(x=>{
      if(!online)throw Error('Offline fullwidth model queried protected function');
      calls++;return F(x);
    },N,seeded(draw()));
    online=false;
    assert.equal(calls,m.queries);
    assert.ok(calls<=6882);
    const restored=/** @type {Model} */(JSON.parse(JSON.stringify({...m,
      base:Array.from(m.base.entries())})));
    restored.base=new Map(restored.base);
    for(let j=0;j<128;j++){
      const x=draw();
      assert.equal(evaluate(restored,x),F(x),'wide mismatch case='+i+', sample='+j);
      wideHeldouts++;
    }
    wide++;wideMaximum=Math.max(wideMaximum,calls);
  }
  assert.ok(quartic>0&&cubic>0);
  const result={seed:'0x4a202611',promise:'degree<=4, top fourth-derivative radical codim<=5, unrestricted lower degrees',
    finite:{cases,outputs,quartic,cubic,maxQueries,perWidth},
    width32:{cases:wide,heldouts:wideHeldouts,maxQueries:wideMaximum,hardConfidenceCap:6882},
    note:'Reproducible seeded queries check correctness; independent-uniform theorem is a separate conditional proof'};
  console.log('RANKFIVE_TOP_QUARTIC_FULL_FUNCTION_CLONE '+JSON.stringify(result));
  return result;
}
if(require.main===module)main();
module.exports={clone,evaluate,main};
