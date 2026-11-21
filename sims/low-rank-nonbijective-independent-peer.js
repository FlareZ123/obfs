'use strict';

const assert=require('node:assert/strict');

// Independent exhaustive finite checks of the proposed rank-r image envelope.
// No imports from the obfuscator or other low-rank attack implementations.
let seed=0x1ab62026;
/** @returns {number} */
function random(){
  seed^=seed<<13;
  seed^=seed>>>17;
  seed^=seed<<5;
  return seed>>>0;
}
/** @param {number} maximum @returns {number} */
function draw(maximum){return random()%maximum;}
/** @param {number[]} columns @param {number} x @returns {number} */
function apply(columns,x){
  let result=0;
  for(let bit=0;bit<columns.length;bit++)if(x&(1<<bit))result^=columns[bit];
  return result;
}
/** @param {number[]} values @returns {number} */
function rank(values){
  /** @type {number[]} */ const pivots=[];
  for(const value of values){
    let next=value;
    while(next){
      const pivot=31-Math.clz32(next);
      if(pivots[pivot])next^=pivots[pivot];
      else{pivots[pivot]=next;break;}
    }
  }
  return pivots.filter(Boolean).length;
}
/** @param {number[]} values @returns {Set<number>} */
function span(values){
  const result=new Set([0]);
  for(const value of values){
    for(const old of Array.from(result))result.add(old^value);
  }
  return result;
}
/** @param {number} n @returns {number[]} */
function invertible(n){
  for(;;){
    const columns=Array.from({length:n},()=>draw(1<<n));
    if(rank(columns)===n)return columns;
  }
}
/**
 * @param {number} n
 * @param {number} r
 * @param {number} projectedBits
 * @returns {(x:number)=>number}
 */
function build(n,r,projectedBits){
  const A=invertible(n);
  const U=Array.from({length:r},()=>draw(1<<n));
  const V=Array.from({length:n},()=>draw(1<<projectedBits));
  const g=Array.from({length:1<<projectedBits},()=>draw(1<<r));
  const b=draw(1<<n);
  return x=>b^apply(A,x)^apply(U,g[apply(V,x)]);
}
/** @param {number} n @param {number} r @param {number} projectedBits @returns {boolean} */
function verify(n,r,projectedBits){
  const F=build(n,r,projectedBits);
  const N=1<<n;
  const values=Array.from({length:N},(_,x)=>F(x));
  const c=values[0];
  const M=Array.from({length:n},(_,i)=>values[1<<i]^c);
  const residuals=values.map((value,x)=>value^c^apply(M,x));
  const W=span(residuals);
  const dimW=Math.log2(W.size);
  assert.ok(Number.isInteger(dimW)&&dimW<=r);

  // For each nonzero linear functional on the true residual span, the
  // nonzero probability is at least 2^-r, even if V has deficient rank.
  for(let mask=1;mask<N;mask++){
    const nonzero=residuals.filter(value=>
      ((mask&value).toString(2).replace(/0/g,'').length&1)===1).length;
    if(nonzero)assert.ok(nonzero*(1<<r)>=N,
      `anti-concentration fails for n=${n}, r=${r}, v=${projectedBits}`);
  }

  // A nonempty envelope is one coset of ker([M | basis(W)]), projected
  // onto x. Its exact candidate count equals 2^(n+dimW-rank([M|W])).
  const envelopeSize=1<<(n+dimW-rank(M.concat(Array.from(W))));
  assert.ok(envelopeSize<=1<<r);
  const outputs=new Set(values);
  for(let y=0;y<N;y++){
    const candidates=[];
    for(let x=0;x<N;x++)if(W.has(y^c^apply(M,x)))candidates.push(x);
    assert.equal(candidates.length, candidates.length?envelopeSize:0);
    assert.ok(candidates.length<=1<<r);
    assert.equal(candidates.some(x=>F(x)===y),outputs.has(y));
  }
  return outputs.size<N;
}

let families=0,nonbijective=0;
for(let n=3;n<=6;n++){
  for(let r=1;r<=Math.min(3,n);r++){
    for(let projectedBits=0;projectedBits<=r;projectedBits++){
      for(let sample=0;sample<180;sample++){
        if(verify(n,r,projectedBits))nonbijective++;
        families++;
      }
    }
  }
}
assert.ok(nonbijective>0);
console.log(JSON.stringify({seed:'0x1ab62026',families,nonbijective,
  bounds:'all tested residual projections >=2^-r, all envelopes <=2^r, full image-membership parity'}));
