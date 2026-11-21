'use strict';

const assert=require('node:assert/strict');
const {invertLowRankDeterministic}=require('./affine-low-rank-oracle.js');

/** @param {number[]} columns @param {number} input @returns {number} */
function apply(columns,input){
  let value=0;
  for(let bit=0;bit<columns.length;bit++)if((input>>>bit)&1)value^=columns[bit];
  return value>>>0;
}

/** @param {number} n @param {()=>number} rng @returns {number[]} */
function randomInvertible(n,rng){
  const cols=Array.from({length:n},(_,i)=>(1<<i)>>>0);
  for(let j=0;j<12*n;j++){
    const a=rng()%n;let b=rng()%(n-1);
    if(b>=a)b++;
    cols[a]=(cols[a]^cols[b])>>>0;
    if((rng()&7)===0){const temp=cols[a];cols[a]=cols[b];cols[b]=temp;}
  }
  return cols;
}


/** @param {number} seed @returns {()=>number} */
function random(seed){
  let x=seed>>>0;
  return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;};
}

/**
 * An invertible 32-bit rank-one shear under unknown dense affine wrappers.
 * @param {()=>number} rng
 * @returns {(x:number)=>number}
 */
function layer(rng){
  const inner=randomInvertible(32,rng);
  const outer=randomInvertible(32,rng);
  const key=rng(),a=rng(),b=rng();
  return x=>{
    const z=(apply(inner,x)^b)>>>0;
    const q=z&0x7fffffff;
    const h=Math.imul((q^key)>>>0,0x9e3779b1)>>>0;
    const flip=((h>>>27)^(q>>>5)^(q&(q>>>3)&(q>>>7)))&1;
    const shuffled=(z^(flip<<31))>>>0;
    return (apply(outer,shuffled)^a)>>>0;
  };
}

/** @param {number} count @param {()=>number} rng @returns {(x:number)=>number} */
function compose(count,rng){
  /** @type {(x:number)=>number} */
  let fn=x=>x;
  for(let i=0;i<count;i++){
    const previous=fn,next=layer(rng);
    fn=x=>next(previous(x));
  }
  return fn;
}

/** @param {number} layers @param {number} trials @param {()=>number} rng */
function run(layers,trials,rng){
  const distribution=Array(layers+1).fill(0);
  let maxQueries=0,maxOrbit=0;
  for(let i=0;i<trials;i++){
    const F=compose(layers,rng);
    const secret=rng(),target=F(secret);
    const found=invertLowRankDeterministic(F,target,{bits:32,rankBound:layers});
    assert.equal(found.preimage,secret);
    assert.equal(F(found.preimage),target);
    const bound=33+2**(2*layers);
    assert.ok(found.oracleCalls<=bound);
    distribution[found.nullity]++;
    maxQueries=Math.max(maxQueries,found.oracleCalls);
    maxOrbit=Math.max(maxOrbit,found.orbitCalls);
  }
  return {layers,trials,distribution,maxQueries,maxOrbit,queryCap:33+2**(2*layers)};
}

function main(){
  const rng=random(0x7a1a2026);
  const results=[run(2,1024,rng),run(3,1024,rng),run(4,256,rng)];
  console.log(JSON.stringify({seed:'0x7a1a2026',results,allPassed:true}));
}

if(require.main===module)main();
module.exports={main,layer,compose};
