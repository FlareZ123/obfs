'use strict';

const assert = require('node:assert/strict');

/** @typedef {(x:number)=>number} Oracle */

/** @param {number} seed @returns {()=>number} */
function makeRandom(seed) {
  let state=seed>>>0;
  return () => {
    state ^= state<<13;
    state ^= state>>>17;
    state ^= state<<5;
    return state>>>0;
  };
}

/** @param {number[]} vectors @param {number} bits @returns {number} */
function rank(vectors,bits) {
  const pivots=new Array(bits).fill(0);
  let count=0;
  for(const vector of vectors) {
    let v=vector;
    for(let bit=bits-1;bit>=0;bit--) {
      if((v&(1<<bit))===0)continue;
      if(pivots[bit])v^=pivots[bit];
      else {pivots[bit]=v;count++;break;}
    }
  }
  return count;
}

/** @param {number[]} columns @param {number} x @returns {number} */
function apply(columns,x) {
  let out=0;
  for(let i=0;i<columns.length;i++)if(x&(1<<i))out^=columns[i];
  return out;
}

/** @param {number[]} columns @returns {(output:number)=>number} */
function inverse(columns) {
  const bits=columns.length;
  const pivots=new Array(bits).fill(0);
  const preimages=new Array(bits).fill(0);
  for(let i=0;i<bits;i++) {
    let value=columns[i], mask=1<<i;
    for(let bit=bits-1;bit>=0;bit--) {
      if(!(value&(1<<bit)))continue;
      if(pivots[bit]) {value^=pivots[bit];mask^=preimages[bit];}
      else {pivots[bit]=value;preimages[bit]=mask;break;}
    }
    assert.notEqual(value,0,'matrix must be invertible');
  }
  return output => {
    let value=output, mask=0;
    for(let bit=bits-1;bit>=0;bit--) {
      if(!(value&(1<<bit)))continue;
      assert.ok(pivots[bit]);
      value^=pivots[bit];
      mask^=preimages[bit];
    }
    assert.equal(value,0);
    return mask;
  };
}

/**
 * Bijection with hidden affine part and arbitrary per-coset permutation:
 * F(x) = A(P^-1-permuted(P(x))) XOR c, where P is invertible.
 * Its deviation from A(P(x)) XOR c lies in A(span(e_0,...,e_(k-1))).
 * @param {number} n @param {number} k @param {number} seed
 * @param {'random'|'sparse'|'cycle'|'identity'} mode
 * @returns {Oracle}
 */
function makeOracle(n,k,seed,mode) {
  assert.ok(Number.isInteger(n)&&n>=1&&n<=12);
  assert.ok(Number.isInteger(k)&&k>=0&&k<=n);
  const random=makeRandom(seed);
  /** @param {number[]} columns */
  function randomMatrix(columns) {
    for(let i=0;i<n*5;i++) {
      const a=random()%n, b=random()%n;
      if(a===b)continue;
      if(random()&1)columns[a]^=columns[b];
      else [columns[a],columns[b]]=[columns[b],columns[a]];
    }
    assert.equal(rank(columns,n),n);
    return columns;
  }
  const columns=randomMatrix(Array.from({length:n},(_,i)=>1<<i));
  const inputColumns=randomMatrix(Array.from({length:n},(_,i)=>1<<i));
  const size=1<<n, fiberSize=1<<k, fiberCount=1<<(n-k), secret=random()&(size-1);
  /** @type {number[][]} */
  const maps=[];
  for(let i=0;i<fiberCount;i++) {
    const perm=Array.from({length:fiberSize},(_,j)=>j);
    if(mode==='random') {
      for(let j=fiberSize-1;j>0;j--) {
        const z=random()%(j+1);
        [perm[j],perm[z]]=[perm[z],perm[j]];
      }
    }
    if(mode==='cycle'&&fiberSize>1)
      for(let j=0;j<fiberSize;j++)perm[j]=(j+1)%fiberSize;
    if(mode==='sparse'&&i===fiberCount-1&&fiberSize>1)
      [perm[0],perm[1]]=[perm[1],perm[0]];
    maps.push(perm);
  }
  const table=Array.from({length:size},(_,x)=>{
    const transformed=apply(inputColumns,x);
    const y=((transformed>>k)<<k)|maps[transformed>>k][transformed&(fiberSize-1)];
    return apply(columns,y)^secret;
  });
  assert.equal(new Set(table).size,size);
  return x=>table[x];
}

/**
 * Invert a forward oracle whose deviation from an unknown invertible affine
 * map lies in an unknown output subspace of dimension at most k.
 * Expected forward calls: <= n+1 + sum_{j=0}^{r-1} 1/(1-2^(j-r)) + 2^k,
 * where r is the observed affine-interpolant rank deficiency (r<=k).
 * This is target inversion with online access; it does not recover source.
 *
 * @param {Oracle} oracle @param {number} y @param {number} n
 * @param {number} k @param {()=>number} random
 * @returns {{x:number,queries:number,probes:number,deficiency:number,cycleSteps:number}}
 */
function recover(oracle,y,n,k,random) {
  const size=1<<n;
  let queries=0;
  /** @type {Map<number,number>} */
  const cache=new Map();
  /** @param {number} x @returns {number} */
  function query(x) {
    if(cache.has(x))return /** @type {number} */(cache.get(x));
    const result=oracle(x);
    cache.set(x,result);
    queries++;
    return result;
  }
  const base=query(0);
  const columns=Array.from({length:n},(_,i)=>query(1<<i)^base);
  const span=[];
  const dependent=[];
  for(let i=0;i<n;i++) {
    if(rank([...span,columns[i]],n)>span.length)span.push(columns[i]);
    else dependent.push(i);
  }
  const deficiency=dependent.length;
  assert.ok(deficiency<=k);
  const residuals=[];
  let probes=0;
  while(residuals.length<deficiency) {
    const x=random()%size;
    const e=query(x)^apply(columns,x)^base;
    probes++;
    if(rank([...span,...residuals,e],n)>span.length+residuals.length)
      residuals.push(e);
    assert.ok(probes<10000,'unexpectedly slow random augmentation');
  }
  const augmented=columns.slice();
  for(let i=0;i<dependent.length;i++)augmented[dependent[i]]^=residuals[i];
  assert.equal(rank(augmented,n),n);
  const solve=inverse(augmented);
  let x=solve(y^base);
  for(let i=0;i<(1<<k);i++) {
    const fx=query(x);
    if(fx===y)return {x,queries,probes,deficiency,cycleSteps:i+1};
    x=solve(fx^base);
  }
  throw Error('coset cycle bound violated');
}

function main() {
  const stats={cases:0,checks:0,maxDeficiency:0,maxProbes:0,maxCycle:0,maxQueries:0,sumQueries:0};
  for(let n=3;n<=12;n++) {
    for(let k=0;k<=Math.min(n,4);k++) {
      for(const mode of /** @type {const} */(['random','sparse','cycle','identity'])) {
        for(let trial=0;trial<25;trial++) {
          const seed=(0xdeadbeef^Math.imul(n,40503)^Math.imul(k,1337)^
            Math.imul(trial+1,3109)^mode.length)>>>0;
          const F=makeOracle(n,k,seed,mode);
          const random=makeRandom(seed^0x7f4a7c15);
          const size=1<<n;
          const cases=n<=6?size:32;
          for(let j=0;j<cases;j++) {
            const target=n<=6?j:random()%size;
            const solved=recover(F,target,n,k,random);
            assert.equal(F(solved.x),target);
            stats.checks++;
            stats.maxDeficiency=Math.max(stats.maxDeficiency,solved.deficiency);
            stats.maxProbes=Math.max(stats.maxProbes,solved.probes);
            stats.maxCycle=Math.max(stats.maxCycle,solved.cycleSteps);
            stats.maxQueries=Math.max(stats.maxQueries,solved.queries);
            stats.sumQueries+=solved.queries;
          }
          stats.cases++;
        }
      }
    }
  }
  console.log(JSON.stringify({...stats,averageQueries:stats.sumQueries/stats.checks},null,2));
}

if(require.main===module)main();
module.exports={rank,apply,inverse,makeOracle,recover,makeRandom,main};
