'use strict';

const { performance } = require('node:perf_hooks');

const MASK32N=(1n<<32n)-1n;

/** @param {number} value @returns {number} */
function u32(value){return value>>>0;}
/** @param {bigint} value @returns {bigint} */
function u32n(value){return value&MASK32N;}

/** @param {number} seed @returns {()=>number} */
function makeRng(seed){
  let state=seed>>>0;
  return()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  };
}

/** @param {number} degree @param {number} seed @returns {bigint[]} */
function makePermutationPolynomial(degree,seed){
  const next=makeRng(seed);
  const coefficients=Array.from({length:degree+1},()=>BigInt(next()));
  coefficients[1]|=1n;
  if(degree>=2){
    let parity=0n;
    for(let index=2;index<=degree;index+=2)parity^=coefficients[index]&1n;
    if(parity!==0n)coefficients[2]^=1n;
  }
  if(degree>=3){
    let parity=0n;
    for(let index=3;index<=degree;index+=2)parity^=coefficients[index]&1n;
    if(parity!==0n)coefficients[3]^=1n;
  }
  if(coefficients[degree]===0n)coefficients[degree]=2n;
  return coefficients.map(u32n);
}

/** @param {bigint[]} coefficients @param {number} input @returns {number} */
function evaluatePolynomial(coefficients,input){
  const x=BigInt(input>>>0);
  let value=0n;
  for(let index=coefficients.length-1;index>=0;index-=1)value=u32n(value*x+coefficients[index]);
  return Number(value)>>>0;
}

/** @param {number} value @returns {number} */
function parity32(value){
  let x=value>>>0;
  x^=x>>>16;
  x^=x>>>8;
  x^=x>>>4;
  x&=15;
  return(0x6996>>>x)&1;
}

/**
 * Build a nonlinear triangular bit permutation. Output bit k is input bit k
 * XOR a deterministic nonlinear Boolean function of lower input bits only.
 * @param {number} seed
 * @returns {(input:number)=>number}
 */
function makeTriangularCompatiblePermutation(seed){
  const next=makeRng(seed);
  const specs=Array.from({length:32},(_,bit)=>{
    const lowerMask=bit===0?0:u32((2**bit)-1);
    return{
      a:next()&lowerMask,
      b:next()&lowerMask,
      c:next()&lowerMask,
      constant:next()&1,
    };
  });
  return(input)=>{
    const x=input>>>0;
    let output=0;
    for(let bit=0;bit<32;bit+=1){
      const lowerMask=bit===0?0:u32((2**bit)-1);
      const lower=x&lowerMask;
      const spec=specs[bit];
      const nonlinear=parity32(lower&spec.a)^
        (parity32(lower&spec.b)&parity32(lower&spec.c))^spec.constant;
      const outputBit=((x>>>bit)&1)^nonlinear;
      if(outputBit!==0)output=u32(output+(2**bit));
    }
    return output>>>0;
  };
}

/**
 * Build a deterministic invertible GF(2) transform as 32 image columns.
 * Elementary column swaps/XORs preserve invertibility.
 * @param {number} seed
 * @returns {number[]}
 */
function makeLinearTransform(seed){
  const next=makeRng(seed);
  const columns=Array.from({length:32},(_,bit)=>u32(2**bit));
  for(let round=0;round<512;round+=1){
    const a=next()%32;
    let b=next()%32;
    if(a===b)b=(b+1)%32;
    if((next()&1)===0)[columns[a],columns[b]]=[columns[b],columns[a]];
    else columns[b]=u32(columns[b]^columns[a]);
  }
  return columns;
}

/** @param {number[]} columns @param {number} input @returns {number} */
function applyLinear(columns,input){
  let x=input>>>0;
  let output=0;
  let bit=0;
  while(x!==0){
    if((x&1)!==0)output^=columns[bit];
    x>>>=1;
    bit+=1;
  }
  return output>>>0;
}

/** @param {number[]} vectors @returns {number[]} */
function makeSpanBasis(vectors){
  const pivots=Array(32).fill(0);
  for(const raw of vectors){
    let value=raw>>>0;
    for(let bit=31;bit>=0&&value!==0;bit-=1){
      if(((value>>>bit)&1)===0)continue;
      if(pivots[bit]!==0)value=u32(value^pivots[bit]);
      else{pivots[bit]=value;break;}
    }
  }
  return pivots;
}

/** @param {number} value @param {number[]} pivots @returns {boolean} */
function isInSpan(value,pivots){
  let current=value>>>0;
  for(let bit=31;bit>=0&&current!==0;bit-=1){
    if(((current>>>bit)&1)===0)continue;
    if(pivots[bit]===0)return false;
    current=u32(current^pivots[bit]);
  }
  return current===0;
}

/**
 * Invert F(x)=L(P(x)) for arbitrary unknown invertible bit-linear L.
 * @param {(input:number)=>number} oracle
 * @param {number} target
 * @returns {{value:number,queryCount:number}}
 */
function invertUnknownOuterLinear(oracle,target){
  /** @type {Map<number,number>} */
  const cache=new Map();
  const query=(input)=>{
    const key=input>>>0;
    const prior=cache.get(key);
    if(prior!==undefined)return prior;
    const output=oracle(key)>>>0;
    cache.set(key,output);
    return output;
  };

  const base=query(0);
  const deltas=[];
  for(let bit=0;bit<32;bit+=1)deltas.push(u32(base^query(u32(2**bit))));
  const suffixSpans=Array(33);
  suffixSpans[32]=makeSpanBasis([]);
  for(let bit=31;bit>=0;bit-=1)suffixSpans[bit]=makeSpanBasis(deltas.slice(bit));

  let prefix=0;
  for(let bit=0;bit<32;bit+=1){
    const difference=u32(target^query(prefix));
    if(!isInSpan(difference,suffixSpans[bit+1]))prefix=u32(prefix|(2**bit));
  }
  if(query(prefix)!==(target>>>0))throw new Error('outer-linear inversion failed final equality');
  return{value:prefix>>>0,queryCount:cache.size};
}

/**
 * Learn the nested input congruence flag for F(x)=P(L(x)).
 * @param {(input:number)=>number} query
 * @returns {number[]}
 */
function learnInnerLinearToggles(query){
  const base=query(0);
  let basis=Array.from({length:32},(_,bit)=>u32(2**bit));
  const toggles=[];
  for(let bit=0;bit<32;bit+=1){
    const labels=basis.map((vector)=>((query(vector)^base)>>>bit)&1);
    const pivotIndex=labels.indexOf(1);
    if(pivotIndex<0)throw new Error(`missing codimension-one pivot at bit ${bit}`);
    const pivot=basis[pivotIndex];
    toggles.push(pivot);
    const nextBasis=[];
    for(let index=0;index<basis.length;index+=1){
      if(index===pivotIndex)continue;
      nextBasis.push(labels[index]===0?basis[index]:u32(basis[index]^pivot));
    }
    basis=nextBasis;
  }
  return toggles;
}

/**
 * Invert F(x)=P(L(x)) for arbitrary unknown invertible bit-linear L.
 * @param {(input:number)=>number} oracle
 * @param {number} target
 * @returns {{value:number,queryCount:number}}
 */
function invertUnknownInnerLinear(oracle,target){
  /** @type {Map<number,number>} */
  const cache=new Map();
  const query=(input)=>{
    const key=input>>>0;
    const prior=cache.get(key);
    if(prior!==undefined)return prior;
    const output=oracle(key)>>>0;
    cache.set(key,output);
    return output;
  };
  const toggles=learnInnerLinearToggles(query);
  let candidate=0;
  for(let bit=0;bit<32;bit+=1){
    const mask=bit===31?0xffffffff:u32((2**(bit+1))-1);
    if((query(candidate)&mask)!==((target>>>0)&mask))candidate=u32(candidate^toggles[bit]);
  }
  if(query(candidate)!==(target>>>0))throw new Error('inner-linear inversion failed final equality');
  return{value:candidate>>>0,queryCount:cache.size};
}

/** @param {number} value @returns {string} */
function hex32(value){return`0x${(value>>>0).toString(16).padStart(8,'0')}`;}

function main(){
  const rows=[];
  const families=[
    {name:'rivest-degree-3',make:(seed)=>{const c=makePermutationPolynomial(3,seed);return(x)=>evaluatePolynomial(c,x);}},
    {name:'rivest-degree-7',make:(seed)=>{const c=makePermutationPolynomial(7,seed);return(x)=>evaluatePolynomial(c,x);}},
    {name:'rivest-degree-15',make:(seed)=>{const c=makePermutationPolynomial(15,seed);return(x)=>evaluatePolynomial(c,x);}},
    {name:'nonlinear-triangular',make:(seed)=>makeTriangularCompatiblePermutation(seed)},
  ];
  let totalCases=0;
  for(const orientation of['outer','inner']){
    for(const family of families){
      const times=[];
      const queryCounts=[];
      for(let caseIndex=0;caseIndex<64;caseIndex+=1){
        const familySalt=family.name.split('').reduce(
          (value,ch)=>u32(Math.imul(value^ch.charCodeAt(0),0x01000193)),0x811c9dc5);
        const seed=u32(0x9e3779b9^familySalt^caseIndex^
          (orientation==='outer'?0x13579bdf:0x2468ace0));
        const permutation=family.make(seed);
        const linear=makeLinearTransform(seed^0xa5a5a5a5);
        const affineOffset=makeRng(seed^0xc3c3c3c3)();
        const secret=makeRng(seed^0x5a5a5a5a)();
        const oracle=orientation==='outer'
          ?(input)=>u32(applyLinear(linear,permutation(input))^affineOffset)
          :(input)=>permutation(u32(applyLinear(linear,input)^affineOffset));
        const target=oracle(secret);
        const startTime=performance.now();
        const attack=orientation==='outer'
          ?invertUnknownOuterLinear(oracle,target)
          :invertUnknownInnerLinear(oracle,target);
        times.push(performance.now()-startTime);
        queryCounts.push(attack.queryCount);
        if(attack.value!==secret)throw new Error(`${orientation} recovery mismatch ${family.name} case ${caseIndex}`);
        if(caseIndex===0)rows.push({
          orientation,family:family.name,
          exampleTarget:hex32(target),exampleRecovered:hex32(attack.value),
        });
        totalCases+=1;
      }
      const row=rows.find((candidate)=>
        candidate.orientation===orientation&&candidate.family===family.name);
      if(!row)throw new Error('missing row');
      times.sort((a,b)=>a-b);
      row.cases=64;
      row.minQueries=Math.min(...queryCounts);
      row.maxQueries=Math.max(...queryCounts);
      row.medianAttackMs=Number(times[Math.floor(times.length/2)].toFixed(3));
    }
  }
  console.log(JSON.stringify({
    model:'black-box inversion of a congruence-preserving 32-bit permutation with one arbitrary unknown invertible GF(2) affine wrapper',
    result:`all ${totalCases} published targets inverted exactly`,
    rows,
    scope:'one arbitrary affine wrapper on either side; no source/AST/seed/permutation internals/matrix/offset given to attacker',
  },null,2));
}

if(require.main===module)main();

module.exports={
  invertUnknownInnerLinear,
  invertUnknownOuterLinear,
  makeLinearTransform,
  makeTriangularCompatiblePermutation,
};
