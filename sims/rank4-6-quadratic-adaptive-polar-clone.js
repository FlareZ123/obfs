'use strict';
const assert=require('node:assert/strict');
const {createHash,randomBytes}=require('node:crypto');

/** @typedef {{bits:number,base:number,linear:number[],coordinates:number[],gram:number[][],rank:4|5|6,queries:number,trials:number,anchors:number}} Clone */

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
 * Upper bound for failing to reach an exact-rank k radical certificate after
 * n independent adaptive pair probes. First success adds two anchors with
 * probability at least (1-2^-k)/2; later success at signature rank r occurs with
 * probability at least (1-2^(-(k-r)))/2, and increases rank by >=1.
 *
 * @param {number} n
 * @param {4|5|6} rank
 * @returns {number}
 */
function missBound(n,rank){
  const probabilities=Array(rank).fill(0);
  probabilities[0]=1;
  for(let t=0;t<n;t++){
    const next=probabilities.slice();
    for(let stage=0;stage<rank-1;stage++){
      const p=stage===0?(1-2**(-rank))/2:(1-2**(-(rank-(stage+1))))/2;
      next[stage]-=probabilities[stage]*p;
      next[stage+1]+=probabilities[stage]*p;
    }
    for(let i=0;i<rank;i++)probabilities[i]=next[i];
  }
  return probabilities.slice(0,rank-1).reduce((a,b)=>a+b,0);
}
/** @param {number} delta @param {4|5|6} rank @returns {number} */
function maxTrials(delta,rank){
  if(!Number.isFinite(delta)||delta<=0||delta>=1)
    throw new RangeError('delta must be in (0,1)');
  for(let n=rank-1;n<=1024;n++)if(missBound(n,rank)<=delta)return n;
  throw new RangeError('delta is too small for 1024 trials');
}
/**
 * Chosen-oracle learner for fixed GF(2)^n degree<=2 mappings whose
 * quadratic-polar radical has **exact codimension four, five, or six**.
 * No private source or hidden projection is provided to the learner.
 *
 * @param {(x:number)=>number} oracle
 * @param {number} bits
 * @param {4|5|6} rank
 * @param {()=>number} [draw] Independent uniform 32-bit draws for the theorem.
 * @param {number} [delta]
 * @returns {Clone}
 */
function clone(oracle,bits,rank,draw=secureDraw,delta=1e-10){
  if(![4,5,6].includes(rank)||!Number.isInteger(bits)||bits<rank||bits>32)
    throw new RangeError('Expected integer input width 4..32 >= radical codimension');
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
  const cap=maxTrials(delta,rank);
  let trials=0;
  for(;trials<cap&&state.rank<rank;trials++){
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
    // A first nonzero pair certifies two independent quotient directions;
    // subsequent probes need only one new anchor.
    for(const anchor of anchorCount===0?[h,y]:[y]){
      const shift=BigInt(32*anchorCount);
      for(let i=0;i<bits;i++){
        signatures[i]^=BigInt(B((1<<i)>>>0,anchor))<<shift;
      }
      anchorCount++;
    }
    const next=reduce(signatures);
    assert.ok(next.rank>state.rank,'Nonzero kernel polar must grow observed signature rank');
    state=next;
  }
  if(state.rank!==rank)
    throw new RangeError('Failed to certify promised exact quadratic polar quotient');
  const pivots=state.pivotIndices;
  assert.equal(pivots.length,rank);
  const pSignatures=pivots.map(i=>signatures[i]);
  const coordinatesMap=new Map();
  for(let code=0;code<(1<<rank);code++){
    let value=0n;
    for(let bit=0;bit<rank;bit++)if((code>>>bit)&1)value^=pSignatures[bit];
    coordinatesMap.set(value.toString(),code);
  }
  assert.equal(coordinatesMap.size,1<<rank);
  const coordinates=signatures.map(value=>{
    const coord=coordinatesMap.get(value.toString());
    assert.notEqual(coord,undefined);
    return /** @type {number} */ (coord);
  });
  const gram=Array.from({length:rank},()=>Array(rank).fill(0));
  for(let i=0;i<rank;i++)for(let j=i+1;j<rank;j++){
    gram[i][j]=B((1<<pivots[i])>>>0,(1<<pivots[j])>>>0);
    gram[j][i]=gram[i][j];
  }
  assert.ok(cache.size<=bits+1+3*cap+rank*bits+rank*(rank-1)/2);
  return {bits,base,linear,coordinates,gram,rank,
    queries:cache.size,trials,anchors:anchorCount};
}
/** @param {number} x @param {number} y @param {number[][]} gram @returns {number} */
function gramValue(x,y,gram){
  let out=0;
  for(let i=0;i<gram.length;i++)if((x>>>i)&1)
    for(let j=0;j<gram.length;j++)if((y>>>j)&1)out^=gram[i][j];
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
/** @param {()=>number} draw @param {number} bits @param {4|5|6} rank @returns {(x:number)=>number} */
function makeFunction(draw,bits,rank){
  const mask=bits===32?0xffffffff:2**bits-1;
  /** @type {number[]} */
  const forms=[];
  while(forms.length<rank){
    const candidate=draw()&mask;
    if(linearRank([...forms,candidate])>forms.length)forms.push(candidate>>>0);
  }
  const vectors=Array.from({length:rank*(rank-1)/2},()=>draw()&mask);
  const linear=Array.from({length:bits},()=>draw()&mask);
  const constant=draw()&mask;
  return x=>{
    let value=constant^apply(linear,x),pair=0;
    for(let i=0;i<rank;i++){
      const ai=parity(forms[i]&x);
      for(let j=i+1;j<rank;j++){
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
  assert.deepEqual([4,5,6].map(k=>maxTrials(1e-10, /** @type {4|5|6} */ (k))),[87,90,92]);
  const sourceDraw=seeded(0x4f562026);
  /** @type {Array<{rank:number,finiteCases:number,finiteOutputs:number,wideCases:number,heldouts:number,maxQueries:number,bound:number,tail:number}>} */
  const evidence=[];
  for(const rank of /** @type {(4|5|6)[]} */ ([4,5,6])){
    let cases=0,outputs=0,wide=0,heldouts=0,maxQueries=0;
    for(let bits=rank;bits<=8;bits++){
      for(let caseNo=0;caseNo<90;caseNo++){
        let F=makeFunction(sourceDraw,bits,rank);
        while(intrinsicRank(F,bits)!==rank)F=makeFunction(sourceDraw,bits,rank);
        let live=true,calls=0;
        const m=clone(x=>{
          if(!live)throw Error('Post-learning oracle call in finite clone');
          calls++;return F(x);
        },bits,rank,seeded(sourceDraw()));
        live=false;
        assert.equal(calls,m.queries);
        for(let x=0;x<(1<<bits);x++){
          assert.equal(evaluate(m,x),F(x));outputs++;
        }
        cases++;maxQueries=Math.max(maxQueries,m.queries);
      }
    }
    for(let i=0;i<96;i++){
      let F=makeFunction(sourceDraw,32,rank);
      while(intrinsicRank(F,32)!==rank)F=makeFunction(sourceDraw,32,rank);
      let live=true,calls=0;
      const m=clone(x=>{
        if(!live)throw Error('Post-learning oracle call in 32-bit clone');
        calls++;return F(x);
      },32,rank,seeded(sourceDraw()));
      live=false;
      assert.equal(calls,m.queries);
      const bound=33+3*maxTrials(1e-10,rank)+rank*32+rank*(rank-1)/2;
      assert.ok(m.queries<=bound);
      maxQueries=Math.max(maxQueries,m.queries);
      for(let j=0;j<256;j++){
        const x=sourceDraw();
        assert.equal(evaluate(m,x),F(x));heldouts++;
      }
      wide++;
    }
    evidence.push({rank,finiteCases:cases,finiteOutputs:outputs,
      wideCases:wide,heldouts,maxQueries,
      bound:33+3*maxTrials(1e-10,rank)+rank*32+rank*(rank-1)/2,
      tail:missBound(maxTrials(1e-10,rank),rank)});
  }
  /** @param {number} x @returns {number} */
  const lower=x=>((x&3)===3?1:0)>>>0;
  for(const rank of /** @type {(4|5|6)[]} */ ([4,5,6])){
    let refused=false;
    try{clone(lower,rank,rank,seeded(rank));}
    catch(e){if(e instanceof RangeError)refused=true;}
    assert.equal(refused,true);
  }
  const result={seed:'0x4f562026',width:32,
    observed:evidence,assumption:'fixed degree<=2, exact radical codimension',
    note:'Deterministic seeded fixtures do not establish independent-uniform probability'};
  console.log('RANK_K_QUADRATIC_ADAPTIVE_POLAR_CLONE '+JSON.stringify(result));
  return result;
}
if(require.main===module)main();
module.exports={clone,evaluate,main,maxTrials,missBound};
