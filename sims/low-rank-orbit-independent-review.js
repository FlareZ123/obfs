'use strict';

// Independent peer review of a chosen-query inversion bound for permutation
// oracles with a low-dimensional nonlinear output residual. No project imports.
const assert=require('node:assert/strict');

/** @param {number} n @returns {number[]} */
function identity(n) {
  return Array.from({length:n},(_,i)=>(1<<i)>>>0);
}

/**
 * Insert a vector into a GF(2) echelon basis.
 * @param {Map<number,{value:number,coordinates:number}>} basis
 * @param {number} vector
 * @param {number} coordinates
 * @returns {boolean}
 */
function insert(basis,vector,coordinates) {
  let value=vector>>>0;
  let mask=coordinates>>>0;
  while(value!==0) {
    const pivot=31-Math.clz32(value);
    const existing=basis.get(pivot);
    if(!existing) {
      basis.set(pivot,{value,coordinates:mask});
      return true;
    }
    value=(value^existing.value)>>>0;
    mask=(mask^existing.coordinates)>>>0;
  }
  return false;
}

/** @param {number[]} vectors @returns {number} */
function rank(vectors) {
  const basis=new Map();
  let found=0;
  for(const value of vectors)if(insert(basis,value,0))found++;
  return found;
}

/** @param {number[]} columns @param {number} value @returns {number} */
function applyLinear(columns,value) {
  let out=0;
  for(let i=0;i<columns.length;i++)if((value>>>i)&1)out^=columns[i];
  return out>>>0;
}

/**
 * @param {number[]} columns Invertible GF(2) matrix, encoded as columns.
 * @returns {(value:number)=>number}
 */
function inverseLinear(columns) {
  const basis=new Map();
  for(let i=0;i<columns.length;i++) {
    assert.equal(insert(basis,columns[i],(1<<i)>>>0),true);
  }
  return value=>{
    let remaining=value>>>0;
    let coordinates=0;
    while(remaining!==0) {
      const row=basis.get(31-Math.clz32(remaining));
      assert.ok(row);
      remaining=(remaining^row.value)>>>0;
      coordinates=(coordinates^row.coordinates)>>>0;
    }
    return coordinates>>>0;
  };
}

/**
 * @param {(value:number)=>number} oracle
 * @param {number} n
 * @param {number} residualRankUpperBound
 * @returns {{invert:(target:number)=>{input:number,steps:number},queries:()=>number,nullity:number,transformedDisplacement:(x:number)=>number}}
 */
function constructInverter(oracle,n,residualRankUpperBound) {
  const samples=new Map();
  /** @param {number} x @returns {number} */
  const query=x=>{
    const key=x>>>0;
    if(!samples.has(key))samples.set(key,oracle(key)>>>0);
    return /** @type {number} */ (samples.get(key));
  };
  const constant=query(0);
  const columns=identity(n).map(x=>(query(x)^constant)>>>0);
  const basis=new Map();
  const missing=[];
  for(let i=0;i<n;i++)if(!insert(basis,columns[i],0))missing.push(i);
  const nullity=missing.length;
  assert.ok(nullity<=residualRankUpperBound);
  const repaired=columns.slice();
  for(const index of missing) {
    const chosen=identity(n).find(v=>insert(basis,v,0));
    assert.notEqual(chosen,undefined);
    repaired[index]=/** @type {number} */ (chosen);
  }
  assert.equal(rank(repaired),n);
  const solve=inverseLinear(repaired);
  /** @param {number} x @returns {number} */
  const transformed=x=>solve((query(x)^constant)>>>0);
  const maxSteps=2**Math.min(n,residualRankUpperBound+nullity);
  return {
    nullity,
    queries:()=>samples.size,
    transformedDisplacement:x=>(transformed(x)^x)>>>0,
    invert:target=>{
      const start=solve((target^constant)>>>0);
      let current=start;
      for(let step=1;step<=maxSteps;step++) {
        const next=transformed(current);
        if(next===start)return {input:current,steps:step};
        current=next;
      }
      throw new Error('orbit exceeded advertised low-rank bound');
    }
  };
}

/** @param {number} seed @returns {()=>number} */
function random(seed) {
  let state=seed>>>0;
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  };
}

/** @param {number} n @param {()=>number} next @returns {number[]} */
function randomInvertible(n,next) {
  const columns=identity(n);
  for(let k=0;k<8*n;k++) {
    const i=next()%n;
    const j=next()%n;
    if(i===j)continue;
    if(next()&1)columns[i]=(columns[i]^columns[j])>>>0;
    else [columns[i],columns[j]]=[columns[j],columns[i]];
  }
  assert.equal(rank(columns),n);
  return columns;
}

/**
 * Independent full-rank permutation with an r-dimensional nonlinear residual.
 * Its base map A=R*L is invertible. The triangular nonlinear layer modifies
 * only the low r bits as a function of higher input bits, so it is bijective.
 * @param {number} r
 * @param {()=>number} next
 * @returns {(x:number)=>number}
 */
function wrappedTriangularOracle(r,next) {
  const left=randomInvertible(32,next);
  const right=randomInvertible(32,next);
  const constant=next();
  return x=>{
    const transformed=applyLinear(left,x);
    const upper=transformed>>>r;
    let delta=0;
    for(let bit=0;bit<r;bit++){
      const first=(upper>>>(2*bit))&1;
      const second=(upper>>>(2*bit+1))&1;
      delta|=(first&second)<<bit;
    }
    const shifted=(transformed^(delta&((1<<r)-1)))>>>0;
    return (applyLinear(right,shifted)^constant)>>>0;
  };
}

/** @param {number[]} values @returns {number[][]} */
function permutations(values) {
  if(values.length===0)return [[]];
  /** @type {number[][]} */
  const result=[];
  for(let i=0;i<values.length;i++) {
    const remaining=values.filter((_,index)=>index!==i);
    for(const tail of permutations(remaining))result.push([values[i],...tail]);
  }
  return result;
}

function main() {
  let permutationsChecked=0;
  let targetsChecked=0;
  let maxSmallQueries=0;
  let maxSmallNullity=0;
  // Exhaustively test all 8-point permutations under a fixed A=I
  // decomposition, whenever their nonlinear displacement rank is <=2.
  for(const table of permutations(identity(8).map((_,i)=>i))) {
    const constant=table[0];
    const residual=table.map((value,x)=>(value^x^constant)>>>0);
    if(rank(residual)>2)continue;
    permutationsChecked++;
    for(let secret=0;secret<8;secret++) {
      const inverter=constructInverter(x=>table[x],3,2);
      const recovered=inverter.invert(table[secret]);
      assert.equal(recovered.input,secret);
      assert.ok(recovered.steps<=2**Math.min(3,2+inverter.nullity));
      assert.ok(inverter.queries()<=4+2**Math.min(3,2+inverter.nullity));
      maxSmallQueries=Math.max(maxSmallQueries,inverter.queries());
      maxSmallNullity=Math.max(maxSmallNullity,inverter.nullity);
      targetsChecked++;
    }
  }
  assert.ok(permutationsChecked>0);

  const next=random(0x41d2026);
  let largeTargets=0;
  let maxLargeQueries=0;
  let maxLargeSteps=0;
  let maxLargeNullity=0;
  const byRank=[];
  for(const r of [2,3,4,5]) {
    let rankTargets=0;
    let rankMaxQueries=0;
    let rankMaxSteps=0;
    let rankMaxNullity=0;
    for(let caseNo=0;caseNo<96;caseNo++) {
      const oracle=wrappedTriangularOracle(r,next);
      for(let targetNo=0;targetNo<8;targetNo++) {
        const secret=next();
        const inverter=constructInverter(oracle,32,r);
        const answer=inverter.invert(oracle(secret));
        assert.equal(answer.input,secret);
        const attackQueries=inverter.queries();
        assert.ok(attackQueries<=33+2**Math.min(32,r+inverter.nullity));
        maxLargeQueries=Math.max(maxLargeQueries,attackQueries);
        const displacement=Array.from({length:64},(_,i)=>inverter.transformedDisplacement(((i<<16)^next())>>>0));
        assert.ok(rank(displacement)<=r+inverter.nullity);
        maxLargeSteps=Math.max(maxLargeSteps,answer.steps);
        maxLargeNullity=Math.max(maxLargeNullity,inverter.nullity);
        rankMaxQueries=Math.max(rankMaxQueries,attackQueries);
        rankMaxSteps=Math.max(rankMaxSteps,answer.steps);
        rankMaxNullity=Math.max(rankMaxNullity,inverter.nullity);
        rankTargets++;
        largeTargets++;
      }
    }
    byRank.push({r,targets:rankTargets,maxQueries:rankMaxQueries,maxSteps:rankMaxSteps,maxNullity:rankMaxNullity});
  }
  console.log('LOW_RANK_ORBIT_INDEPENDENT_REVIEW '+JSON.stringify({
    width3:{permutationsChecked,targetsChecked,maxQueries:maxSmallQueries,maxNullity:maxSmallNullity},
    width32:{targetsChecked:largeTargets,maxQueries:maxLargeQueries,maxSteps:maxLargeSteps,maxNullity:maxLargeNullity,byRank},
    theory:{boundAtRank2:33+2**4,boundAtRank3:33+2**6,boundAtRank4:33+2**8,boundAtRank5:33+2**10},
    seed:'0x41d2026'
  }));
}

if(require.main===module)main();

module.exports={constructInverter,rank,applyLinear};
