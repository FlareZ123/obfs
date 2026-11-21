'use strict';

const assert=require('node:assert/strict');

const WIDTH=5;
const SIZE=1<<WIDTH;

/** @param {number} seed @returns {()=>number} */
function rng(seed) {
  let state=seed>>>0;
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  };
}

/** @param {number[]} columns @param {number} input @returns {number} */
function apply(columns,input) {
  let out=0;
  for(let bit=0;bit<WIDTH;bit++)if((input&(1<<bit))!==0)out^=columns[bit];
  return out;
}

/** @param {number[]} values @returns {number} */
function rank(values) {
  const pivots=Array(WIDTH).fill(0);
  let count=0;
  for(const original of values) {
    let value=original;
    for(let bit=WIDTH-1;bit>=0;bit--) {
      if((value&(1<<bit))===0)continue;
      if(pivots[bit]!==0)value^=pivots[bit];
      else {
        pivots[bit]=value;
        count++;
        break;
      }
    }
  }
  return count;
}

/** @param {number[]} basis @returns {Set<number>} */
function span(basis) {
  const values=new Set([0]);
  for(const vector of basis) {
    for(const value of [...values])values.add(value^vector);
  }
  return values;
}

/** @param {number[]} columns @param {number} rhs @returns {number} */
function solveUnique(columns,rhs) {
  const solutions=[];
  for(let input=0;input<SIZE;input++)if(apply(columns,input)===rhs)solutions.push(input);
  assert.equal(solutions.length,1,'expected full-rank interpolant solve');
  return solutions[0];
}

/**
 * Full-rank target attack that never receives the hidden nonlinear span.
 * A two-shear architecture guarantees at most four points in the hidden coset.
 * @param {(x:number)=>number} oracle
 * @param {number} target
 * @param {number} base
 * @param {number[]} columns
 * @returns {{value:number,queries:number}}
 */
function invertFullRankOrbit(oracle,target,base,columns) {
  const origin=solveUnique(columns,target^base);
  let residual=0;
  for(let queries=1;queries<=4;queries++) {
    const candidate=origin^solveUnique(columns,residual);
    const observed=oracle(candidate);
    if(observed===target)return {value:candidate,queries};
    residual=observed^target;
  }
  throw new Error('full-rank residual orbit exceeded two-shear coset size');
}


/** @param {()=>number} next @returns {number[]} */
function invertible(next) {
  while(true) {
    const columns=Array.from({length:WIDTH},()=>next()%SIZE);
    if(rank(columns)===WIDTH)return columns;
  }
}

/**
 * Build a Boolean shear control invariant in one coordinate.
 * @param {()=>number} next
 * @param {number} excludedBit
 * @returns {(value:number)=>number}
 */
function control(next,excludedBit) {
  const masks=Array.from({length:4},()=>next()%SIZE & ~(1<<excludedBit));
  return value=>{
    const p=masks.map(mask=>(value&mask).toString(2).replaceAll('0','').length&1);
    return p[0]^(p[1]&p[2])^(p[2]&p[3]);
  };
}

/**
 * @param {number} seed
 * @returns {{oracle:(x:number)=>number,range:Set<number>}}
 */
function twoShears(seed) {
  const next=rng(seed);
  const l0=invertible(next);
  const l1=invertible(next);
  const l2=invertible(next);
  const bit1=next()%WIDTH;
  const bit2=next()%WIDTH;
  const e1=1<<bit1;
  const e2=1<<bit2;
  const h1=control(next,bit1);
  const h2=control(next,bit2);
  const c0=next()%SIZE;
  const c1=next()%SIZE;
  const c2=next()%SIZE;
  const w1=apply(l2,apply(l1,e1));
  const w2=apply(l2,e2);
  return {
    oracle(input) {
      let value=apply(l0,input)^c0;
      if(h1(value))value^=e1;
      value=apply(l1,value)^c1;
      if(h2(value))value^=e2;
      return apply(l2,value)^c2;
    },
    range:span([w1,w2])
  };
}

function main() {
  /** @type {Map<number,number>} */
  const rangeDimensions=new Map();
  /** @type {Map<number,number>} */
  const interpolantRanks=new Map();
  let targets=0;
  let fullRankCases=0;
  let fullRankTargets=0;
  let maxOrbitQueries=0;
  let maxCandidates=0;
  let maxResidualValues=0;

  for(let caseIndex=0;caseIndex<100;caseIndex++) {
    const {oracle,range}=twoShears(0x9e3779b9^caseIndex);
    const outputs=Array.from({length:SIZE},(_,x)=>oracle(x));
    assert.equal(new Set(outputs).size,SIZE,'two compatible shears must remain a permutation');

    const base=oracle(0);
    const columns=Array.from({length:WIDTH},(_,bit)=>oracle(1<<bit)^base);
    const rangeDimension=Math.log2(range.size);
    const interpolantRank=rank(columns);
    assert.ok(interpolantRank>=WIDTH-rangeDimension);
    rangeDimensions.set(rangeDimension,(rangeDimensions.get(rangeDimension)??0)+1);
    interpolantRanks.set(interpolantRank,(interpolantRanks.get(interpolantRank)??0)+1);
    if(interpolantRank===WIDTH)fullRankCases++;

    const residuals=new Set();
    for(let x=0;x<SIZE;x++) {
      const residual=oracle(x)^base^apply(columns,x);
      assert.ok(range.has(residual));
      residuals.add(residual);
    }
    maxResidualValues=Math.max(maxResidualValues,residuals.size);

    for(let secret=0;secret<SIZE;secret++) {
      const targetOffset=oracle(secret)^base;
      const candidates=[];
      for(let x=0;x<SIZE;x++) {
        if(range.has(apply(columns,x)^targetOffset))candidates.push(x);
      }
      assert.equal(candidates.length,range.size);
      assert.ok(candidates.includes(secret));
      assert.deepEqual(candidates.filter(x=>oracle(x)===oracle(secret)),[secret]);
      if(interpolantRank===WIDTH) {
        const attack=invertFullRankOrbit(oracle,oracle(secret),base,columns);
        assert.equal(attack.value,secret);
        maxOrbitQueries=Math.max(maxOrbitQueries,attack.queries);
        fullRankTargets++;
      }
      maxCandidates=Math.max(maxCandidates,candidates.length);
      targets++;
    }
  }

  assert.equal(targets,3200);
  assert.ok(fullRankTargets>0);
  assert.ok(maxOrbitQueries<=4);
  assert.ok(maxCandidates<=4);
  console.log(JSON.stringify({
    width:WIDTH,
    cases:100,
    targets,
    fullRankCases,
    fullRankTargets,
    maxOrbitQueries,
    rangeDimensions:Object.fromEntries([...rangeDimensions].sort()),
    interpolantRanks:Object.fromEntries([...interpolantRanks].sort()),
    maxResidualValues,
    maxCandidates
  }));
}

if(require.main===module)main();
