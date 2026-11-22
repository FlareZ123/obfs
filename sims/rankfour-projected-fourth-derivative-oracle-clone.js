'use strict';

const assert=require('node:assert/strict');
const {learn:learnCubicRescue,evaluate:evaluateCubicRescue}=
  require('./rankfour-projected-cubic-rescue');

/** @typedef {ReturnType<typeof learnCubicRescue>} CubicFallback */
/** @typedef {{bits:number,degree:2|3|4,base:number,linear:number[],
  projected:number[],higher:number[],fallback:CubicFallback|null,
  queries:number,trials:number,fallbackTrials:number}} Clone */

/** @param {number} seed @returns {()=>number} */
function seeded(seed){
  let x=seed>>>0;
  return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;};
}
/** @param {number[]} columns @param {number} input @returns {number} */
function apply(columns,input){
  let out=0;
  for(let i=0;i<columns.length;i++)if((input>>>i)&1)out^=columns[i];
  return out>>>0;
}
/** @param {number} value @returns {number} */
function parity(value){
  value^=value>>>16;value^=value>>>8;value^=value>>>4;
  value^=value>>>2;value^=value>>>1;return value&1;
}
/** @param {number[]} columns @returns {number} */
function rank32(columns){
  const pivots=Array(32).fill(0);
  let result=0;
  for(const entry of columns){
    let word=entry>>>0;
    for(let bit=31;bit>=0;bit--){
      if(!((word>>>bit)&1))continue;
      if(pivots[bit])word=(word^pivots[bit])>>>0;
      else{pivots[bit]=word;result++;break;}
    }
  }
  return result;
}
/** @param {()=>number} draw @returns {number[]} */
function invertible32(draw){
  const columns=Array.from({length:32},(_,i)=>(1<<i)>>>0);
  for(let j=0;j<384;j++){
    const a=draw()%32;
    let b=draw()%31;if(b>=a)b++;
    columns[a]=(columns[a]^columns[b])>>>0;
    if((draw()&3)===0){
      const tmp=columns[a];columns[a]=columns[b];columns[b]=tmp;
    }
  }
  assert.equal(rank32(columns),32);
  return columns;
}

/** @param {number[]} coefficients @param {number} coords @returns {number} */
function nonlinear(coefficients,coords){
  let out=0;
  for(let mask=1;mask<16;mask++){
    if((coords&mask)===mask)out^=coefficients[mask];
  }
  return out>>>0;
}

/**
 * Learn every output of F(x)=b XOR A*x XOR U*g(Vx) on GF(2)^n with
 * rank(V)<=4 and arbitrary g, including singular A and noninjective F.
 *
 * When the quartic coefficient is nonzero, a random 4-tuple gives a
 * fourth-difference witness with p=315/1024. With confidence 1-delta
 * the learned model contains the entire function, offline.
 * If the true quartic coefficient vanishes, a third-derivative
 * signature recovers its cubic component and a generic quadratic
 * learner recovers the residual. The source-class confidence bounds
 * are conditional alternatives, not additive failure events.
 *
 * @param {(x:number)=>number} oracle
 * @param {number} bits
 * @param {()=>number} draw
 * @param {number} [delta]
 * @returns {Clone}
 */
function clone(oracle,bits,draw,delta=1e-10){
  if(!Number.isInteger(bits)||bits<4||bits>32)
    throw new RangeError('Require 4..32 input bits');
  if(!Number.isFinite(delta)||delta<=0||delta>=1)
    throw new RangeError('Require failure tolerance in (0,1)');
  const mask=bits===32?0xffffffff:2**bits-1;
  /** @type {Map<number,number>} */
  const seen=new Map();
  /** @param {number} x @returns {number} */
  function ask(x){
    const input=(x&mask)>>>0;
    if(!seen.has(input))seen.set(input,oracle(input)>>>0);
    return /** @type {number} */ (seen.get(input));
  }
  const base=ask(0);
  const basis=Array.from({length:bits},(_,i)=>
    (ask((1<<i)>>>0)^base)>>>0);
  /**
   * Fourth mixed difference at the origin.
   * @param {number[]} anchors exactly four vectors
   * @returns {number}
   */
  function T4(anchors){
    let out=0;
    for(let tuple=0;tuple<16;tuple++){
      let x=0;
      for(let i=0;i<4;i++)if((tuple>>>i)&1)x^=anchors[i];
      out^=ask(x>>>0);
    }
    return out>>>0;
  }

  const witnessProbability=315/1024;
  const limit=Math.ceil(Math.log(delta)/Math.log(1-witnessProbability));
  /** @type {number[]} */
  let anchors=[];
  let quartic=0,trials=0;
  for(;trials<limit;trials++){
    const candidates=[draw()&mask,draw()&mask,draw()&mask,draw()&mask];
    const value=T4(candidates);
    if(value){
      anchors=candidates;
      quartic=value;
      trials++;
      break;
    }
  }
  if(quartic===0){
    const fallback=learnCubicRescue(ask,bits,draw,delta);
    // Both stages query F(0) and every F(e_i); those bits+1 values
    // are shared by the outer cache, so they are not paid twice.
    assert.ok(seen.size<=15*limit+fallback.queries);
    return {bits,degree:fallback.degree,base,linear:basis,
      projected:[],higher:[],fallback,queries:seen.size,trials,
      fallbackTrials:fallback.trials};
  }

  const coefficients=Array.from({length:16},(_,m)=>{
    let x=0;
    for(let i=0;i<4;i++)if((m>>>i)&1)x^=anchors[i];
    return ask(x>>>0);
  });
  // Boolean Möbius inversion along the hidden projected anchor basis.
  for(let i=0;i<4;i++){
    for(let m=0;m<16;m++){
      if((m>>>i)&1)coefficients[m]^=coefficients[m^(1<<i)];
    }
  }
  // All affine ANF coefficients are replaced by the true public-basis
  // linear interpolation; only degree >=2 must remain in H.
  for(let m=0;m<16;m++){
    let weight=0;
    for(let i=0;i<4;i++)weight+=(m>>>i)&1;
    if(weight<=1)coefficients[m]=0;
  }
  assert.equal(coefficients[15]>>>0,quartic>>>0);

  const projected=[];
  const linear=[];
  for(let j=0;j<bits;j++){
    const e=(1<<j)>>>0;
    let coords=0;
    for(let i=0;i<4;i++){
      const basis4=anchors.slice();
      basis4[i]=e;
      const value=T4(basis4);
      assert.ok(value===0||value===quartic);
      if(value)coords|=1<<i;
    }
    projected.push(coords);
    linear.push((basis[j]^nonlinear(coefficients,coords))>>>0);
  }
  assert.ok(seen.size<=bits+1+15*limit+14*bits);
  return {bits,degree:4,base,linear,projected,
    higher:coefficients,fallback:null,queries:seen.size,trials,
    fallbackTrials:0};
}

/** @param {Clone} model @param {number} input @returns {number} */
function evaluate(model,input){
  if(model.degree!==4){
    assert.notEqual(model.fallback,null);
    return evaluateCubicRescue(/** @type {CubicFallback} */ (model.fallback),input);
  }
  let result=(model.base^apply(model.linear,input))>>>0;
  let coords=0;
  for(let i=0;i<model.bits;i++){
    if((input>>>i)&1)coords^=model.projected[i];
  }
  result^=nonlinear(model.higher,coords);
  return result>>>0;
}

/**
 * @param {()=>number} draw
 * @param {'quartic'|'cubic-lower'|'singular'} kind
 * @returns {(x:number)=>number}
 */
function make32(draw,kind){
  const A=invertible32(draw);
  if(kind==='singular')A[0]=0;
  /** @type {number[]} */
  const V=[];
  while(V.length<4){
    let next=draw();
    if(kind==='singular')next&=0xfffffffe;
    if(rank32([...V,next])===V.length+1)V.push(next>>>0);
  }
  const table=Array.from({length:16},()=>draw());
  if(kind==='cubic-lower'){
    let last=0;
    for(let i=0;i<15;i++)last^=table[i];
    table[15]=last>>>0;
  }else{
    let parityValue=0;
    for(const entry of table)parityValue^=entry;
    if(parityValue===0)table[15]^=1;
  }
  const offset=draw();
  /** @param {number} x @returns {number} */
  const F=x=>{
    const z=parity(V[0]&x)|(parity(V[1]&x)<<1)|
      (parity(V[2]&x)<<2)|(parity(V[3]&x)<<3);
    return (offset^apply(A,x)^table[z])>>>0;
  };
  if(kind==='singular')assert.equal(F(0),F(1));
  return F;
}

/** @returns {object} */
function main(){
  let finiteCases=0,finiteOutputs=0,finiteLower=0,finiteQuartic=0;
  for(let truth=0;truth<65536;truth++){
    /** @param {number} x @returns {number} */
    const F=x=>(x^((truth>>>x)&1))>>>0;
    let enabled=true,actualCalls=0;
    const model=clone(x=>{
      if(!enabled)throw Error('Offline model requested forbidden oracle');
      actualCalls++;return F(x);
    },4,seeded((0x8ab44f13^truth*0x9e3779b9)>>>0));
    enabled=false;
    assert.equal(actualCalls,model.queries);
    assert.ok(actualCalls<=16);
    const saved=/** @type {Clone} */ (JSON.parse(JSON.stringify(model)));
    for(let x=0;x<16;x++){
      assert.equal(evaluate(saved,x),F(x),
        'Full width-four truth-table mismatch at function '+truth+', input '+x);
      finiteOutputs++;
    }
    if(model.degree===4)finiteQuartic++;else finiteLower++;
    finiteCases++;
  }
  assert.equal(finiteCases,65536);
  assert.equal(finiteOutputs,1048576);
  assert.equal(finiteQuartic+finiteLower,finiteCases);

  const draw=seeded(0x7c1a430f);
  const kinds=/** @type {const} */ (['quartic','cubic-lower','singular']);
  let width32Cases=0,heldoutOutputs=0,noninjectiveCases=0;
  let maxQuarticQueries=0,maxFallbackQueries=0,maxQueries=0;
  let quarticBranch=0,lowerBranch=0;
  for(const kind of kinds){
    for(let trial=0;trial<4;trial++){
      const source=make32(draw,kind);
      let enabled=true,callCount=0;
      const model=clone(x=>{
        if(!enabled)throw Error('Offline rank-four model requested server');
        callCount++;return source(x);
      },32,seeded((0xa4e1970b^draw())>>>0));
      enabled=false;
      assert.equal(callCount,model.queries);
      assert.ok(callCount<=2080);
      const serial=/** @type {Clone} */ (JSON.parse(JSON.stringify(model)));
      for(let i=0;i<512;i++){
        const x=draw();
        assert.equal(evaluate(serial,x),source(x),
          'Rank-four 32-bit heldout mismatch');
        heldoutOutputs++;
      }
      if(model.degree===4){quarticBranch++;maxQuarticQueries=
        Math.max(maxQuarticQueries,callCount);}
      else{lowerBranch++;maxFallbackQueries=
        Math.max(maxFallbackQueries,callCount);}
      if(kind==='singular')noninjectiveCases++;
      maxQueries=Math.max(maxQueries,callCount);
      width32Cases++;
    }
  }
  assert.ok(quarticBranch>0&&lowerBranch>0);
  const output={
    class:'Full source-only oracle clone with hidden projection rank<=4',
    finiteWidth4:{cases:finiteCases,exhaustiveOutputs:finiteOutputs,
      quarticWitness:finiteQuartic,cubicOrLowerFallback:finiteLower},
    width32:{cases:width32Cases,heldoutOutputs,noninjectiveCases,
      quarticBranch,lowerBranch,maxQuarticQueries,maxFallbackQueries,maxQueries},
    probability:'Quartic witness probability 315/1024 from independent-uniform fourth-order tuples',
    delta:1e-10,trainingTuples:63,
    quarticBranchCap:1426,quarticFreeCubicRescueCap:2080,
    genericUnrestrictedQuarticTraining:41449,
    note:'Fixed-seed tests prove deterministic output consistency on selected sources, not the independent-uniform tail'
  };
  console.log(JSON.stringify(output,null,2));
  return output;
}
if(require.main===module)main();
module.exports={clone,evaluate,main};
