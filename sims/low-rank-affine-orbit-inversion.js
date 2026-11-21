'use strict';

const assert=require('node:assert/strict');

/** @param {number} width @returns {number} */
function wordMask(width){return width===32?0xffffffff:(2**width-1)>>>0;}
/** @param {number} width @param {number} i @returns {number} */
function bit(width,i){assert.ok(i>=0&&i<width);return (1<<i)>>>0;}

/** @param {number[]} columns @param {number} x @returns {number} */
function apply(columns,x){
  let out=0;
  for(let j=0;j<columns.length;j++)if((x>>>j)&1)out^=columns[j];
  return out>>>0;
}

/**
 * Incrementally reduce column-space vectors, retaining their input-coordinate
 * representations so the same basis can later invert a repaired matrix.
 * @param {number} n
 */
function createBasis(n){
  /** @type {Array<{word:number,representation:number}|undefined>} */
  const pivots=Array(n);
  /** @param {number} vector @param {number} repr @returns {boolean} */
  function add(vector,repr){
    let v=vector>>>0, r=repr>>>0;
    for(let j=n-1;j>=0;j--){
      if(!((v>>>j)&1))continue;
      const pivot=pivots[j];
      if(pivot){v=(v^pivot.word)>>>0;r=(r^pivot.representation)>>>0;}
      else {pivots[j]={word:v,representation:r};return true;}
    }
    return false;
  }
  /** @param {number} vector @returns {number} */
  function solve(vector){
    let v=vector>>>0, r=0;
    for(let j=n-1;j>=0;j--){
      if(!((v>>>j)&1))continue;
      const pivot=pivots[j];
      if(!pivot)throw new Error('Input is outside matrix image');
      v=(v^pivot.word)>>>0;r=(r^pivot.representation)>>>0;
    }
    return r>>>0;
  }
  return {add,solve,pivots};
}

/**
 * Repair a possibly singular n-by-n binary matrix by replacing only the
 * original dependent columns. Exactly nullity(M) columns are replaced.
 * @param {number[]} columns
 * @returns {{columns:number[],rank:number,nullity:number}}
 */
function repair(columns){
  const n=columns.length;
  const basis=createBasis(n);
  const out=columns.slice();
  /** @type {number[]} */
  const dependent=[];
  for(let i=0;i<n;i++)if(!basis.add(out[i],bit(n,i)))dependent.push(i);
  for(const i of dependent){
    let found=false;
    for(let j=0;j<n;j++){
      const unit=bit(n,j);
      if(basis.add(unit,bit(n,i))){out[i]=unit;found=true;break;}
    }
    if(!found)throw new Error('Cannot extend independent columns');
  }
  return {columns:out,rank:n-dependent.length,nullity:dependent.length};
}

/**
 * Invert y=F(secret) using chosen oracle calls only. The theorem assumes
 * F(x)=c XOR A(x) XOR v(x), with A invertible, the complete set of v(x)
 * confined to an unknown r-dimensional output linear subspace, and F a
 * permutation of n-bit words. No part of A, v or its subspace is supplied.
 *
 * @param {(x:number)=>number} F
 * @param {number} n
 * @param {number} r
 * @param {number} target
 * @returns {{preimage:number,queries:number,orbitLength:number,rank:number,nullity:number,cap:number}}
 */
function recover(F,n,r,target){
  if(!Number.isInteger(n)||n<1||n>32||!Number.isInteger(r)||r<0||r>n)
    throw new RangeError('Require 1 <= n <= 32 and 0 <= r <= n');
  const mask=wordMask(n);
  /** @type {Map<number,number>} */
  const cache=new Map();
  /** @param {number} x @returns {number} */
  function query(x){
    const key=(x&mask)>>>0;
    if(!cache.has(key))cache.set(key,F(key)>>>0);
    return /** @type {number} */ (cache.get(key));
  }
  const origin=query(0);
  const m=Array.from({length:n},(_,i)=>(query(bit(n,i))^origin)>>>0);
  const m0=repair(m);
  const inverse=createBasis(n);
  for(let i=0;i<n;i++)assert.equal(inverse.add(m0.columns[i],bit(n,i)),true);
  const z=inverse.solve((target^origin)>>>0);
  let cur=z;
  const bound=2**Math.min(n,r+m0.nullity);
  for(let step=1;step<=bound;step++){
    const next=inverse.solve((query(cur)^origin)>>>0);
    if(next===z){
      assert.ok(cache.size<=n+1+bound);
      return {preimage:cur,queries:cache.size,orbitLength:step,
        rank:m0.rank,nullity:m0.nullity,cap:n+1+bound};
    }
    cur=next;
  }
  throw new Error('Orbit exceeded proven rank bound');
}

/** @param {number} seed @returns {()=>number} */
function random(seed){
  let s=seed>>>0||0x9e3779b9;
  return ()=>{
    s^=s<<13;s^=s>>>17;s^=s<<5;
    return s>>>0;
  };
}

/** @param {number} n @param {()=>number} rng @returns {number[]} */
function randomInvertible(n,rng){
  const columns=Array.from({length:n},(_,j)=>bit(n,j));
  for(let j=0;j<12*n;j++){
    const a=rng()%n;
    let b=rng()%(n-1);
    if(b>=a)b++;
    columns[a]=(columns[a]^columns[b])>>>0;
    if((rng()&7)===0){const temp=columns[a];columns[a]=columns[b];columns[b]=temp;}
  }
  return columns;
}

/** @returns {number[][]} */
function permutationsOfFour(){
  /** @type {number[][]} */
  const values=[];
  /** @param {number[]} prefix @param {number[]} rest */
  function rec(prefix,rest){
    if(rest.length===0){values.push(prefix);return;}
    for(let i=0;i<rest.length;i++)rec([...prefix,rest[i]],rest.filter((_,j)=>j!==i));
  }
  rec([],[0,1,2,3]);
  return values;
}

/** @param {number} n @param {number[]} permutationLow @param {number[]} permutationHigh @returns {(x:number)=>number} */
function twoCosetPermutation(n,permutationLow,permutationHigh){
  const shift=n-2;
  const mask=wordMask(shift);
  return x=>{
    const q=x&mask;
    const high=x>>>shift;
    const permutation=q===0?permutationLow:permutationHigh;
    return (q|(permutation[high]<<shift))>>>0;
  };
}

/** @param {number} n @param {number[][]} permutations @param {number} key @returns {(x:number)=>number} */
function hashedCosetPermutation(n,permutations,key){
  const shift=n-2;
  const mask=wordMask(shift);
  return x=>{
    const q=x&mask;
    const high=x>>>shift;
    const hash=(Math.imul((q^key)>>>0,0x9e3779b1)>>>0)%permutations.length;
    return (q|(permutations[hash][high]<<shift))>>>0;
  };
}

/** @param {number} n @param {number} r @param {number[][]} permutations @param {number} key @returns {(x:number)=>number} */
function generalizedCosetPermutation(n,r,permutations,key){
  const shift=n-r,mask=wordMask(shift);
  return x=>{
    const q=x&mask;
    const high=x>>>shift;
    const hash=(Math.imul((q^key)>>>0,0x9e3779b1)>>>0)%permutations.length;
    return (q|(permutations[hash][high]<<shift))>>>0;
  };
}

/** @param {number} r @param {number} count @param {()=>number} rng @returns {number[][]} */
function sampledCosetPermutations(r,count,rng){
  const values=[];
  for(let trial=0;trial<count;trial++){
    const perm=Array.from({length:2**r},(_,i)=>i);
    for(let i=perm.length-1;i>0;i--){
      const j=rng()%(i+1),tmp=perm[i];
      perm[i]=perm[j];perm[j]=tmp;
    }
    values.push(perm);
  }
  return values;
}

/** @param {(x:number)=>number} inner @param {number[]} input @param {number[]} output @param {number} inOffset @param {number} outOffset @returns {(x:number)=>number} */
function wrap(inner,input,output,inOffset,outOffset){
  return x=>(apply(output,inner((apply(input,x)^inOffset)>>>0))^outOffset)>>>0;
}

/** @returns {void} */
function main(){
  const perms=permutationsOfFour();
  const byNullity=[0,0,0,0];
  let count=0,maxQueries=0,maxOrbit=0;
  for(const p0 of perms)for(const p1 of perms){
    const F=twoCosetPermutation(3,p0,p1);
    for(let secret=0;secret<8;secret++){
      const y=F(secret);
      const result=recover(F,3,2,y);
      assert.equal(result.preimage,secret);
      byNullity[result.nullity]++;
      maxQueries=Math.max(maxQueries,result.queries);
      maxOrbit=Math.max(maxOrbit,result.orbitLength);
      count++;
    }
  }
  // Independent exhaustive enumeration: all 8! permutation tables whose
  // deviation from the identity affine map spans at most two output bits.
  let allPermutationTables=0;
  let eligibleTables=0;
  let exhaustiveTargets=0;
  const exhaustiveNullity=[0,0,0,0];
  let exhaustiveMaxQueries=0;
  /** @param {number[]} prefix @param {number[]} remaining */
  function inspectPermutation(prefix,remaining){
    if(remaining.length){
      for(let i=0;i<remaining.length;i++)
        inspectPermutation([...prefix,remaining[i]],
          remaining.filter((_,j)=>j!==i));
      return;
    }
    allPermutationTables++;
    const origin=prefix[0];
    const span=createBasis(3);
    let residualRank=0;
    for(let i=0;i<8;i++)
      if(span.add((prefix[i]^i^origin)>>>0,0))residualRank++;
    if(residualRank>2)return;
    eligibleTables++;
    /** @param {number} x */
    const F=x=>prefix[x];
    for(let x=0;x<8;x++){
      const got=recover(F,3,2,F(x));
      assert.equal(got.preimage,x);
      assert.ok(got.queries<=12);
      exhaustiveNullity[got.nullity]++;
      exhaustiveMaxQueries=Math.max(exhaustiveMaxQueries,got.queries);
      exhaustiveTargets++;
    }
  }
  inspectPermutation([],[0,1,2,3,4,5,6,7]);
  const rng=random(0xc0ffe37a);
  const byNullity32=[0,0,0];
  let maxQueries32=0,maxOrbit32=0;
  for(let trial=0;trial<1024;trial++){
    const inMatrix=randomInvertible(32,rng);
    const outMatrix=randomInvertible(32,rng);
    const P=hashedCosetPermutation(32,perms,rng());
    const F=wrap(P,inMatrix,outMatrix,rng(),rng());
    const secret=rng();
    const y=F(secret);
    const result=recover(F,32,2,y);
    assert.equal(result.preimage,secret,'target preimage must match');
    assert.equal(F(result.preimage),y,'actual oracle output must match');
    assert.ok(result.queries<=49);
    byNullity32[result.nullity]++;
    maxQueries32=Math.max(maxQueries32,result.queries);
    maxOrbit32=Math.max(maxOrbit32,result.orbitLength);
  }
  const rng3=random(0x82345fa1);
  const permutations3=sampledCosetPermutations(3,64,rng3);
  const byNullityR3=[0,0,0,0];
  let maxQueriesR3=0,maxOrbitR3=0;
  for(let trial=0;trial<1024;trial++){
    const inMatrix=randomInvertible(32,rng3);
    const outMatrix=randomInvertible(32,rng3);
    const P=generalizedCosetPermutation(32,3,permutations3,rng3());
    const F=wrap(P,inMatrix,outMatrix,rng3(),rng3());
    const secret=rng3(),y=F(secret);
    const result=recover(F,32,3,y);
    assert.equal(result.preimage,secret);
    assert.ok(result.queries<=97);
    byNullityR3[result.nullity]++;
    maxQueriesR3=Math.max(maxQueriesR3,result.queries);
    maxOrbitR3=Math.max(maxOrbitR3,result.orbitLength);
  }
  console.log(JSON.stringify({
    seed:'0xc0ffe37a',width3:{pairs:count,byNullity,maxQueries,maxOrbit},
    exhaustive3:{allPermutationTables,eligibleTables,exhaustiveTargets,
      byNullity:exhaustiveNullity,maxQueries:exhaustiveMaxQueries},
    width32:{cases:1024,byNullity:byNullity32,maxQueries:maxQueries32,
      maxOrbit:maxOrbit32,queryCap:49},
    width32Rank3:{cases:1024,byNullity:byNullityR3,maxQueries:maxQueriesR3,
      maxOrbit:maxOrbitR3,queryCap:97},
    theorem:'Any n-bit permutation F(x)=c xor A(x) xor delta(x), A invertible, delta in dimension-r subspace; n+1+2^(r+nullity(M)) oracle queries, with nullity(M)<=r; worst n+1+2^(2r).'
  }));
}

if(require.main===module)main();
module.exports={recover,repair,createBasis,apply,randomInvertible,main};
