'use strict';

const assert=require('node:assert/strict');
const {recover,apply,randomInvertible}=require('./low-rank-affine-orbit-inversion.js');

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
    const found=recover(F,32,layers,target);
    assert.equal(found.preimage,secret);
    assert.equal(F(found.preimage),target);
    const bound=33+2**(2*layers);
    assert.ok(found.queries<=bound);
    distribution[found.nullity]++;
    maxQueries=Math.max(maxQueries,found.queries);
    maxOrbit=Math.max(maxOrbit,found.orbitLength);
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
