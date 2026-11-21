'use strict';

const assert=require('node:assert/strict');

/**
 * Independent forward-oracle clone for all vector-valued quadratic functions
 * F: GF(2)^n -> GF(2)^n whose quadratic polar form factors through an input
 * quotient of dimension at most three. The affine core may be singular.
 *
 * The theorem's random tail requires fresh independent uniform pair draws.
 * Deterministic PRNGs below are reproducible regression fixtures only.
 *
 * @typedef {{bits:number,base:number,linear:number[],coefficients:number[],
 *   gram:number[],rank:number,queries:number,trials:number}} Clone
 */

/** @param {number} seed @returns {()=>number} */
function seeded(seed){
  let state=seed>>>0;
  return ()=>{
    state^=state<<13;state^=state>>>17;state^=state<<5;
    return state>>>0;
  };
}

/** @param {number[]} columns @param {number} x @returns {number} */
function apply(columns,x){
  let result=0;
  for(let bit=0;bit<columns.length;bit++)
    if((x>>>bit)&1)result^=columns[bit];
  return result>>>0;
}

/** @param {number} value @returns {number} */
function parity(value){
  value^=value>>>16;value^=value>>>8;value^=value>>>4;
  value^=value>>>2;value^=value>>>1;
  return value&1;
}

/** @param {number} x @param {number} y @returns {number} */
function popcountPair(x,y){
  return ((x&1)&&((y>>>1)&1))^(((x>>>1)&1)&&(y&1));
}

/**
 * Alternating Gram value on the quotient basis (a,b[,c]).
 * @param {number} x
 * @param {number} y
 * @param {number[]} gram
 * @returns {number}
 */
function gramValue(x,y,gram){
  let value=0;
  if(popcountPair(x,y))value^=gram[0];
  if(gram.length===3){
    if(((x&1)&&((y>>>2)&1))^(((x>>>2)&1)&&(y&1)))value^=gram[1];
    if((((x>>>1)&1)&&((y>>>2)&1))^(((x>>>2)&1)&&((y>>>1)&1)))value^=gram[2];
  }
  return value>>>0;
}

/**
 * Learn a complete exact offline model under the stated quadratic rank <=3
 * input projection promise. An affine-only model after t unsuccessful pairs
 * is correct except on the stated independent-uniform failure event.
 *
 * @param {(x:number)=>number} oracle
 * @param {number} bits
 * @param {()=>number} draw
 * @param {number} [delta]
 * @returns {Clone}
 */
function clone(oracle,bits,draw,delta=1e-10){
  if(!Number.isInteger(bits)||bits<1||bits>32)
    throw new RangeError('Input width must be 1..32');
  if(!Number.isFinite(delta)||delta<=0||delta>=1)
    throw new RangeError('Failure probability must lie in (0,1)');
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

  const pairLimit=Math.ceil(Math.log(delta)/Math.log(5/8));
  let a=0,b=0,w=0,trials=0;
  for(;trials<pairLimit;trials++){
    const x=draw()&mask,y=draw()&mask;
    const value=B(x,y);
    if(value){
      a=x>>>0;b=y>>>0;w=value;trials++;
      break;
    }
  }
  if(!w)return {bits,base,linear,coefficients:[],gram:[],
    rank:0,queries:cache.size,trials};

  /** @param {number} x @returns {bigint} */
  function signature(x){
    return (BigInt(B(x,a))<<32n)|BigInt(B(x,b));
  }
  const signatureA=BigInt(w);
  const signatureB=BigInt(w)<<32n;
  const signatures=Array.from({length:bits},(_,i)=>
    signature((1<<i)>>>0));
  let signatureC=0n, cIndex=-1;
  for(let i=0;i<bits;i++){
    const s=signatures[i];
    if(s!==0n&&s!==signatureA&&s!==signatureB&&
       s!==(signatureA^signatureB)){
      signatureC=s;cIndex=i;
      break;
    }
  }
  const rank=cIndex===-1?2:3;
  const basis=rank===2?[signatureA,signatureB]:
    [signatureA,signatureB,signatureC];
  /** @type {number[]} */
  const coefficients=[];
  for(const s of signatures){
    let found=-1;
    for(let m=0;m<(1<<rank);m++){
      let value=0n;
      for(let i=0;i<rank;i++)if((m>>>i)&1)value^=basis[i];
      if(value===s){found=m;break;}
    }
    assert.notEqual(found,-1,'A rank<=3 quadratic polar form must have a 2/3D signature image');
    coefficients.push(found);
  }
  const gram=rank===2?[w]:[
    w,
    Number(signatureC>>32n)>>>0,
    Number(signatureC&0xffffffffn)>>>0
  ];
  assert.ok(cache.size<=bits+1+3*pairLimit+2*bits);
  return {bits,base,linear,coefficients,gram,rank,queries:cache.size,trials};
}

/** @param {Clone} model @param {number} x @returns {number} */
function evaluate(model,x){
  let value=(model.base^apply(model.linear,x))>>>0;
  if(model.rank===0)return value;
  let prefix=0;
  for(let i=0;i<model.bits;i++){
    if(!((x>>>i)&1))continue;
    const next=model.coefficients[i];
    value^=gramValue(prefix,next,model.gram);
    prefix^=next;
  }
  return value>>>0;
}

/** @param {()=>number} draw @returns {number[]} */
function matrix32(draw){
  const cols=Array.from({length:32},(_,i)=>(1<<i)>>>0);
  for(let i=0;i<256;i++){
    const x=draw()%32,y=draw()%32;
    cols[x]=(cols[x]^cols[y])>>>0;
  }
  return cols;
}

/**
 * A random full-width rank <=3 quadratic projected function.
 * @param {()=>number} draw
 * @param {number} width
 * @returns {(x:number)=>number}
 */
function projected(draw,width){
  const bitsMask=width===32?0xffffffff:2**width-1;
  const A=width===32?matrix32(draw):
    Array.from({length:width},()=>draw()&bitsMask);
  const projections=Array.from({length:3},()=>draw()&bitsMask);
  const vectors=Array.from({length:3},()=>draw()&bitsMask);
  const constant=draw()&bitsMask;
  return x=>{
    const z=projections.map(p=>parity(p&x));
    let nonlinear=0;
    if(z[0]&z[1])nonlinear^=vectors[0];
    if(z[0]&z[2])nonlinear^=vectors[1];
    if(z[1]&z[2])nonlinear^=vectors[2];
    return (constant^apply(A,x)^nonlinear)>>>0;
  };
}

/** @returns {object} */
function main(){
  const draw=seeded(0x17f62026);
  let total=0,nonlinear=0,fullRank3=0,checked=0,maxQueries=0;
  for(let n=3;n<=8;n++){
    for(let caseNo=0;caseNo<350;caseNo++){
      const F=projected(draw,n);
      let live=true,callCount=0;
      const model=clone(x=>{
        if(!live)throw Error('Offline evaluator contacted protected oracle');
        callCount++;return F(x);
      },n,seeded(draw()));
      live=false;
      assert.equal(callCount,model.queries);
      for(let x=0;x<(1<<n);x++){
        assert.equal(evaluate(model,x),F(x),
          'Finite all-target parity n='+n+', case='+caseNo+', x='+x);
        checked++;
      }
      if(model.rank)nonlinear++;
      if(model.rank===3)fullRank3++;
      maxQueries=Math.max(maxQueries,model.queries);
      total++;
    }
  }
  let large=0,heldout=0,largeRank3=0;
  for(let trial=0;trial<160;trial++){
    const F=projected(draw,32);
    let live=true,actual=0;
    const model=clone(x=>{
      if(!live)throw Error('Offline 32-bit evaluator contacted oracle');
      actual++;return F(x);
    },32,seeded(draw()));
    live=false;
    assert.equal(actual,model.queries);
    assert.ok(actual<=244);
    if(model.rank===3)largeRank3++;
    for(let i=0;i<512;i++){
      const x=draw();
      assert.equal(evaluate(model,x),F(x));
      heldout++;
    }
    large++;
  }
  assert.ok(fullRank3>0&&largeRank3>0);
  const record={seed:'0x17f62026',finite:{cases:total,
    exhaustiveOutputs:checked,nonlinear,rankThree:fullRank3,
    maxDistinctQueries:maxQueries},width32:{cases:large,
    heldoutOutputs:heldout,rankThree:largeRank3,
    confidenceQueryCap:244},assumptions:'degree <=2, input projection rank<=3'};
  console.log(JSON.stringify(record,null,2));
  return record;
}
if(require.main===module)main();
module.exports={clone,evaluate,main};
