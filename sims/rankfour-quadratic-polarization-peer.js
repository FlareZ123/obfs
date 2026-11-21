'use strict';
const assert=require('node:assert/strict');
const {createHash,randomBytes}=require('node:crypto');

/** @typedef {{bits:number,base:number,linear:number[],coordinates:number[],gram:number[][],rank:4,queries:number,trials:number,anchors:number}} Clone */

/** @param {number} seed @returns {()=>number} */
function seeded(seed){
  let index=0;
  return ()=>createHash('sha256').update(String(seed)+'/'+(index++)).digest().readUInt32BE(0);
}
/** @returns {number} */
function secureDraw(){return randomBytes(4).readUInt32BE(0);}
/** @param {number[]} columns @param {number} x @returns {number} */
function apply(columns,x){
  let y=0;
  for(let i=0;i<columns.length;i++)if((x>>>i)&1)y^=columns[i];
  return y>>>0;
}
/** @param {number} x @returns {number} */
function parity(x){
  x^=x>>>16;x^=x>>>8;x^=x>>>4;x^=x>>>2;x^=x>>>1;
  return x&1;
}
/**
 * Kernel basis of x |-> XOR_i x_i columns[i] over GF(2).
 * The pivot indices give independent original input basis vectors.
 * @param {bigint[]} columns
 * @returns {{rank:number,pivotIndices:number[],kernel:number[]}}
 */
function reduce(columns){
  /** @type {Map<number,{value:bigint,coords:number}>} */
  const pivots=new Map();
  /** @type {number[]} */
  const pivotIndices=[];
  /** @type {number[]} */
  const kernel=[];
  for(let i=0;i<columns.length;i++){
    let value=columns[i],coords=(1<<i)>>>0;
    let independent=false;
    while(value!==0n){
      const pivot=value.toString(2).length-1;
      const row=pivots.get(pivot);
      if(!row){
        pivots.set(pivot,{value,coords});
        pivotIndices.push(i);
        independent=true;
        break;
      }
      value^=row.value;
      coords=(coords^row.coords)>>>0;
    }
    if(!independent)kernel.push(coords);
  }
  assert.equal(kernel.length+pivotIndices.length,columns.length);
  return {rank:pivotIndices.length,pivotIndices,kernel};
}
/** @param {number[]} values @returns {number} */
function linearRank(values){return reduce(values.map(x=>BigInt(x>>>0))).rank;}
/**
 * A one-sided exact binomial CDF for P[Binomial(n,1/4)<4].
 * @param {number} n
 * @returns {number}
 */
function missBound(n){
  let term=(3/4)**n,prob=term;
  for(let k=1;k<4;k++){
    term*=((n-k+1)/k)/3;
    prob+=term;
  }
  return prob;
}
/** @param {number} delta @returns {number} */
function maxTrials(delta){
  if(!Number.isFinite(delta)||delta<=0||delta>=1)
    throw new RangeError('delta must be in (0,1)');
  for(let n=4;n<=1024;n++)if(missBound(n)<=delta)return n;
  throw new RangeError('delta is too small for the 1024-trial cap');
}
/**
 * Chosen-oracle learner for fixed GF(2)^n degree<=2 mappings whose
 * quadratic-polar radical has **exact codimension four**.
 * No private source or hidden projection is provided to the learner.
 *
 * @param {(x:number)=>number} oracle
 * @param {number} bits
 * @param {()=>number} [draw] Independent uniform 32-bit draws for the theorem.
 * @param {number} [delta]
 * @returns {Clone}
 */
function clone(oracle,bits,draw=secureDraw,delta=1e-10){
  if(!Number.isInteger(bits)||bits<4||bits>32)
    throw new RangeError('Expected 4..32 input bits');
  const mask=bits===32?0xffffffff:2**bits-1;
  /** @type {Map<number,number>} */
  const cache=new Map();
  /** @param {number} x @returns {number} */
  function ask(x){
    const key=(x&mask)>>>0;
    if(!cache.has(key))cache.set(key,oracle(key)>>>0);
    return /** @type {number} */ (cache.get(key));
  }
  const base=ask(0);
  const linear=Array.from({length:bits},(_,i)=>
    (ask((1<<i)>>>0)^base)>>>0);
  /** @param {number} x @param {number} y @returns {number} */
  function B(x,y){
    return (ask((x^y)>>>0)^ask(x)^ask(y)^base)>>>0;
  }
  /** @type {bigint[]} */
  const signatures=Array(bits).fill(0n);
  let anchorCount=0;
  let state=reduce(signatures);
  const cap=maxTrials(delta);
  let trials=0;
  for(;trials<cap&&state.rank<4;trials++){
    // A uniform linear combination of a basis of the current kernel
    // yields a uniform h in that kernel under fresh uniform draw bits.
    const bitsDraw=draw();
    let h=0;
    for(let j=0;j<state.kernel.length;j++){
      if((bitsDraw>>>j)&1)h^=state.kernel[j];
    }
    h>>>=0;
    const y=(draw()&mask)>>>0;
    if(B(h,y)===0)continue;
    const shift=BigInt(32*anchorCount);
    for(let i=0;i<bits;i++){
      signatures[i]^=BigInt(B((1<<i)>>>0,y))<<shift;
    }
    anchorCount++;
    const next=reduce(signatures);
    assert.ok(next.rank>state.rank,'Nonzero kernel polar must grow observed signature rank');
    state=next;
  }
  if(state.rank!==4)
    throw new RangeError('Failed to certify exact four-dimensional quadratic polar quotient');
  const pivots=state.pivotIndices;
  assert.equal(pivots.length,4);
  const pSignatures=pivots.map(i=>signatures[i]);
  const coordinatesMap=new Map();
  for(let code=0;code<16;code++){
    let value=0n;
    for(let bit=0;bit<4;bit++)if((code>>>bit)&1)value^=pSignatures[bit];
    coordinatesMap.set(value.toString(),code);
  }
  assert.equal(coordinatesMap.size,16);
  const coordinates=signatures.map(value=>{
    const coord=coordinatesMap.get(value.toString());
    assert.notEqual(coord,undefined);
    return /** @type {number} */ (coord);
  });
  const gram=Array.from({length:4},()=>Array(4).fill(0));
  for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){
    gram[i][j]=B((1<<pivots[i])>>>0,(1<<pivots[j])>>>0);
    gram[j][i]=gram[i][j];
  }
  assert.ok(cache.size<=bits+1+3*cap+4*bits+6);
  return {bits,base,linear,coordinates,gram,rank:4,
    queries:cache.size,trials,anchors:anchorCount};
}
/** @param {number} x @param {number} y @param {number[][]} gram @returns {number} */
function gramValue(x,y,gram){
  let out=0;
  for(let i=0;i<4;i++)if((x>>>i)&1)
    for(let j=0;j<4;j++)if((y>>>j)&1)out^=gram[i][j];
  return out>>>0;
}
/** @param {Clone} model @param {number} x @returns {number} */
function evaluate(model,x){
  let y=model.base,seen=0;
  for(let i=0;i<model.bits;i++)if((x>>>i)&1){
    y^=model.linear[i];
    y^=gramValue(seen,model.coordinates[i],model.gram);
    seen^=model.coordinates[i];
  }
  return y>>>0;
}
/** @param {()=>number} draw @param {number} bits @returns {(x:number)=>number} */
function makeFunction(draw,bits){
  const mask=bits===32?0xffffffff:2**bits-1;
  /** @type {number[]} */
  const forms=[];
  while(forms.length<4){
    const candidate=draw()&mask;
    if(linearRank([...forms,candidate])>forms.length)forms.push(candidate>>>0);
  }
  const vectors=Array.from({length:6},()=>draw()&mask);
  const linear=Array.from({length:bits},()=>draw()&mask);
  const constant=draw()&mask;
  return x=>{
    let value=constant^apply(linear,x),pair=0;
    for(let i=0;i<4;i++){
      const ai=parity(forms[i]&x);
      for(let j=i+1;j<4;j++){
        if(ai&parity(forms[j]&x))value^=vectors[pair];
        pair++;
      }
    }
    return (value&mask)>>>0;
  };
}
/** @param {(x:number)=>number} F @param {number} bits @returns {number} */
function intrinsicRank(F,bits){
  const c=F(0);
  const signatures=Array(bits).fill(0n);
  for(let a=0;a<bits;a++)for(let b=0;b<bits;b++){
    const x=(1<<a)>>>0,y=(1<<b)>>>0;
    const value=(F(x^y)^F(x)^F(y)^c)>>>0;
    signatures[a]^=BigInt(value)<<BigInt(32*b);
  }
  return reduce(signatures).rank;
}
/** @returns {object} */
function main(){
  assert.equal(maxTrials(1e-10),112);
  assert.ok(missBound(112)<1e-10);
  const sourceDraw=seeded(0x417b2026);
  let cases=0,outputs=0,maxUsed=0,maxTrialsObserved=0;
  let minAnchors=4,maxAnchors=0;
  for(let bits=4;bits<=8;bits++){
    for(let i=0;i<120;i++){
      let F=makeFunction(sourceDraw,bits);
      while(intrinsicRank(F,bits)!==4)F=makeFunction(sourceDraw,bits);
      let serverOn=true,calls=0;
      const m=clone(x=>{
        if(!serverOn)throw Error('Client made post-training oracle call');
        calls++;return F(x);
      },bits,seeded((sourceDraw()^i)>>>0));
      serverOn=false;
      assert.equal(calls,m.queries);
      for(let x=0;x<(1<<bits);x++){
        assert.equal(evaluate(m,x),F(x));outputs++;
      }
      cases++;maxUsed=Math.max(maxUsed,m.queries);
      maxTrialsObserved=Math.max(maxTrialsObserved,m.trials);
      minAnchors=Math.min(minAnchors,m.anchors);
      maxAnchors=Math.max(maxAnchors,m.anchors);
    }
  }
  let wide=0,wideHeldouts=0,wideMax=0;
  for(let i=0;i<96;i++){
    let F=makeFunction(sourceDraw,32);
    while(intrinsicRank(F,32)!==4)F=makeFunction(sourceDraw,32);
    let live=true,actual=0;
    const m=clone(x=>{
      if(!live)throw Error('Post-training oracle call in 32-bit clone');
      actual++;return F(x);
    },32,seeded(sourceDraw()));
    live=false;
    assert.equal(actual,m.queries);
    assert.ok(m.queries<=503);
    for(let j=0;j<256;j++){
      const x=sourceDraw();
      assert.equal(evaluate(m,x),F(x));wideHeldouts++;
    }
    wide++;wideMax=Math.max(wideMax,m.queries);
  }
  let rankThreeRefused=false;
  const lower=x=>((x&3)===3?1:0)>>>0;
  try{clone(lower,4,seeded(7));}catch(e){
    if(e instanceof RangeError)rankThreeRefused=true;
  }
  assert.equal(rankThreeRefused,true);
  const result={seed:'0x417b2026',intrinsicExactRank:4,
    finite:{cases,exhaustiveOutputs:outputs,maxUsed,maxTrialsObserved,minAnchors,maxAnchors},
    width32:{cases:wide,heldoutOutputs:wideHeldouts,maxUsed:wideMax,confidenceCap:503},
    lowerRankControlRefused:rankThreeRefused,samplingTrials:maxTrials(1e-10),
    exactBinomialFailureUpper:missBound(112)};
  console.log('RANKFOUR_QUADRATIC_POLAR_CLONE '+JSON.stringify(result));
  return result;
}
if(require.main===module)main();
module.exports={clone,evaluate,main,maxTrials,missBound};
