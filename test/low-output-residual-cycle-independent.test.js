'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {inverseWithFullRankInterpolation,inverseWithoutRankBound}=require('../sims/low-rank-residual-cycle-inversion');

/**
 * Independently check the conditional n+2^r oracle-inversion theorem using
 * an explicit finite function table, complete affine-interpolant lookup,
 * and arbitrary seeded permutations inside unknown quotient cosets.
 * The implementation shares no matrix solver or permutation generator with
 * sims/low-rank-residual-cycle-inversion.js.
 */

/** @param {number} seed @returns {(limit:number)=>number} */
function random(seed) {
  let word=seed>>>0;
  return limit=>{
    word^=word<<13;
    word^=word>>>17;
    word^=word<<5;
    return (word>>>0)%limit;
  };
}

/** @param {number[]} columns @param {number} value @returns {number} */
function linear(columns,value) {
  let answer=0;
  for(let bit=0;bit<columns.length;bit++)if(value&(1<<bit))answer^=columns[bit];
  return answer;
}

/** @param {number[]} basis @returns {number[]} */
function span(basis) {
  let values=[0];
  for(const vector of basis)values=[...values,...values.map(value=>value^vector)];
  return values;
}

/** @param {(limit:number)=>number} pick @param {number} width @returns {number[]} */
function independentBasis(pick,width) {
  const columns=Array.from({length:width},(_,index)=>1<<index);
  for(let move=0;move<16*width;move++){
    const i=pick(width);
    let j=pick(width-1);
    if(j>=i)j++;
    if(pick(2)===0)[columns[i],columns[j]]=[columns[j],columns[i]];
    else columns[i]^=columns[j];
  }
  return columns;
}

/**
 * @param {(limit:number)=>number} pick
 * @param {number} width
 * @param {number} rank
 * @returns {number[]}
 */
function randomSubspace(pick,width,rank) {
  /** @type {number[]} */
  const basis=[];
  const domain=1<<width;
  while(basis.length<rank){
    const candidate=pick(domain);
    if(!span(basis).includes(candidate))basis.push(candidate);
  }
  return span(basis);
}

/**
 * An independent permutation of each U-coset, then an unknown invertible
 * output linear transform and translation. All F evaluations below are
 * from the resulting finite table and expose neither hidden transform.
 * @param {(limit:number)=>number} pick
 * @param {number} width
 * @param {number} rank
 * @returns {number[]}
 */
function sourcePermutation(pick,width,rank) {
  const domain=1<<width;
  const directions=randomSubspace(pick,width,rank);
  const columns=independentBasis(pick,width);
  const offset=pick(domain);
  const permutation=Array(domain).fill(-1);
  for(let x=0;x<domain;x++){
    if(permutation[x]!==-1)continue;
    const coset=directions.map(u=>x^u);
    const image=[...coset];
    for(let j=image.length-1;j>0;j--){
      const k=pick(j+1);
      [image[j],image[k]]=[image[k],image[j]];
    }
    coset.forEach((value,index)=>{permutation[value]=image[index];});
  }
  assert.equal(new Set(permutation).size,domain);
  return permutation.map(value=>linear(columns,value)^offset);
}

/**
 * Independently recover the preimage using only the chosen-value oracle.
 * Lookup-table inversion replaces Gaussian elimination. A null result
 * means precisely that the measured affine interpolation is singular.
 *
 * @param {number[]} oracleTable
 * @param {number} width
 * @param {number} rank
 * @param {number} target
 * @returns {{eligible:boolean,preimage:number|null,queries:number,residualDimension:number|null}}
 */
function invert(oracleTable,width,rank,target) {
  const domain=1<<width;
  /** @type {Map<number,number>} */
  const ledger=new Map();
  /** @param {number} x @returns {number} */
  function call(x) {
    if(!ledger.has(x))ledger.set(x,oracleTable[x]);
    return /** @type {number} */(ledger.get(x));
  }
  const intercept=call(0);
  const columns=Array.from({length:width},(_,bit)=>call(1<<bit)^intercept);
  const inverse=Array(domain).fill(-1);
  for(let x=0;x<domain;x++){
    const image=linear(columns,x);
    if(inverse[image]!==-1)return {
      eligible:false,preimage:null,queries:ledger.size,residualDimension:null
    };
    inverse[image]=x;
  }
  // Explicitly verify the hidden promise by enumerating all known private
  // finite-table outputs. This check belongs to the independent verifier,
  // never to the attacker query ledger.
  /** @type {Set<number>} */
  let residualSpan=new Set([0]);
  for(let x=0;x<domain;x++){
    const residual=oracleTable[x]^intercept^linear(columns,x);
    if(residualSpan.has(residual))continue;
    for(const value of [...residualSpan])residualSpan.add(value^residual);
  }
  const dimension=Math.log2(residualSpan.size);
  assert.ok(Number.isInteger(dimension)&&dimension<=rank);
  const image=oracleTable[target];
  const z=inverse[image^intercept];
  let state=z;
  for(let step=0;step<(1<<rank)-1;step++){
    const next=inverse[call(state)^intercept];
    if(next===z)return {
      eligible:true,preimage:state,queries:ledger.size,residualDimension:dimension
    };
    state=next;
  }
  return {eligible:true,preimage:state,queries:ledger.size,residualDimension:dimension};
}

/**
 * Rank-unaware independent cycle walk. The attacker receives the target
 * output, not the secret input, and follows the induced permutation until
 * the orbit returns to its start.
 *
 * @param {number[]} oracleTable
 * @param {number} width
 * @param {number} targetOutput
 * @returns {{eligible:boolean,preimage:number|null,queries:number,cycleSteps:number}}
 */
function invertWithoutRankBound(oracleTable,width,targetOutput) {
  const domain=1<<width;
  /** @type {Map<number,number>} */
  const ledger=new Map();
  /** @param {number} x @returns {number} */
  function call(x) {
    if(!ledger.has(x))ledger.set(x,oracleTable[x]);
    return /** @type {number} */(ledger.get(x));
  }
  const intercept=call(0);
  const columns=Array.from({length:width},(_,bit)=>call(1<<bit)^intercept);
  const inverse=Array(domain).fill(-1);
  for(let x=0;x<domain;x++){
    const image=linear(columns,x);
    if(inverse[image]!==-1)return {
      eligible:false,preimage:null,queries:ledger.size,cycleSteps:0
    };
    inverse[image]=x;
  }
  const z=inverse[targetOutput^intercept];
  let state=z;
  let cycleSteps=0;
  const visited=new Set([z]);
  for(;;){
    const next=inverse[call(state)^intercept];
    cycleSteps++;
    if(next===z)return {
      eligible:true,preimage:state,queries:ledger.size,cycleSteps
    };
    if(visited.has(next))return {
      eligible:false,preimage:null,queries:ledger.size,cycleSteps
    };
    visited.add(next);
    state=next;
  }
}

/**
 * @returns {{seed:number,instances:number,eligible:number,singular:number,targets:number,
 *  successful:number,maxQueries:number,violations:number,byWidthRank:{
 *    width:number,rank:number,eligible:number,singular:number,targets:number,maxQueries:number}[]}}
 */
function verify() {
  const seed=20261122;
  const pick=random(seed);
  const byWidthRank=[];
  let instances=0,eligible=0,singular=0,targets=0,successful=0,maxQueries=0,violations=0;
  for(let width=2;width<=6;width++)for(let rank=0;rank<=width;rank++){
    const row={width,rank,eligible:0,singular:0,targets:0,maxQueries:0};
    for(let repetition=0;repetition<100;repetition++){
      instances++;
      const source=sourcePermutation(pick,width,rank);
      let observedEligible;
      for(let target=0;target<source.length;target++){
        const result=invert(source,width,rank,target);
        if(observedEligible===undefined)observedEligible=result.eligible;
        assert.equal(result.eligible,observedEligible);
        if(!result.eligible)continue;
        targets++;
        row.targets++;
        assert.equal(result.preimage,target,
          'source preimage mismatch '+width+'/'+rank+'/'+repetition+'/'+target);
        successful++;
        maxQueries=Math.max(maxQueries,result.queries);
        row.maxQueries=Math.max(row.maxQueries,result.queries);
        if(result.queries>width+(1<<rank))violations++;
      }
      if(observedEligible){eligible++;row.eligible++;}
      else {singular++;row.singular++;}
    }
    byWidthRank.push(row);
  }
  assert.equal(instances,2500);
  assert.equal(eligible+singular,instances);
  assert.equal(violations,0);
  assert.equal(successful,targets);
  return {seed,instances,eligible,singular,targets,successful,maxQueries,
    violations,byWidthRank};
}

/**
 * A worst-case full-length rank-r cycle whose entire active coset avoids
 * the n+1 interpolation input points 0,e_0,...,e_(n-1).
 * This saturates the stated algorithm's distinct-query bound exactly.
 * @param {number} rank
 * @returns {{table:number[],width:number,target:number}}
 */
function maximalCycle(rank) {
  if(!Number.isInteger(rank)||rank<1||rank>5)
    throw new RangeError('Expected construction rank 1 through 5');
  const width=rank===1?3:rank*2;
  const directions=Array.from({length:rank},(_,bit)=>
    (1<<(2*bit))^(1<<(2*bit+1)));
  const origin=rank===1?((1<<0)^(1<<2)):
    Array.from({length:rank},(_,bit)=>1<<(2*bit))
      .reduce((sum,bit)=>sum^bit,0);
  const coset=Array.from({length:1<<rank},(_,x)=>
    origin^linear(directions,x));
  const interpolation=new Set([0,...Array.from({length:width},(_,bit)=>1<<bit)]);
  assert.ok(coset.every(x=>!interpolation.has(x)));
  const table=Array.from({length:1<<width},(_,x)=>x);
  coset.forEach((x,index)=>{table[x]=coset[(index+1)%coset.length];});
  return {table,width,target:coset[0]};
}

test('the stated traversal procedure attains n+2^r distinct queries on full cycles',()=>{
  for(let rank=1;rank<=5;rank++){
    const {table,width,target}=maximalCycle(rank);
    const outcome=invert(table,width,rank,target);
    assert.equal(outcome.eligible,true);
    assert.equal(outcome.residualDimension,rank);
    assert.equal(outcome.preimage,target);
    assert.equal(outcome.queries,width+(1<<rank));
  }
});

test('full-rank cycle inversion can run without knowing the residual rank',()=>{
  for(let rank=1;rank<=5;rank++){
    const {table,width,target}=maximalCycle(rank);
    const outcome=invertWithoutRankBound(table,width,table[target]);
    assert.equal(outcome.eligible,true);
    assert.equal(outcome.preimage,target);
    assert.equal(outcome.cycleSteps,1<<rank);
    // Without a known rank cap, the final return edge must be queried.
    assert.equal(outcome.queries,width+1+(1<<rank));
  }
});

test('simulation implementation matches known- and unknown-rank full-cycle bounds',()=>{
  for(let rank=1;rank<=5;rank++){
    const {table,width,target}=maximalCycle(rank);
    /** @type {(x:number)=>number} */
    const oracle=x=>table[x];
    const known=inverseWithFullRankInterpolation(width,rank,oracle,table[target]);
    const unknown=inverseWithoutRankBound(width,oracle,table[target]);
    assert.ok(known);
    assert.ok(unknown);
    assert.equal(known.secret,target);
    assert.equal(unknown.secret,target);
    assert.equal(known.queries,width+(1<<rank));
    assert.equal(unknown.queries,width+1+(1<<rank));
    assert.equal(known.cycleSteps,(1<<rank)-1);
    assert.equal(unknown.cycleSteps,1<<rank);
  }
});

test('n+1 calibration calls cannot certify the hidden global residual rank',()=>{
  const {table,width,target}=maximalCycle(1);
  const affine=Array.from({length:1<<width},(_,x)=>x);
  const sampled=[0,...Array.from({length:width},(_,bit)=>1<<bit)];
  for(const x of sampled)assert.equal(table[x],affine[x]);
  // Both permutations agree on every calibration call and the same
  // published target output y. Their correct preimages nevertheless differ.
  const y=table[target];
  assert.notEqual(target,y);
  assert.equal(affine.indexOf(y),y);
  assert.equal(table.indexOf(y),target);
});

test('independent finite-table coset-cycle inversion, all small widths and ranks',()=>{
  const result=verify();
  assert.ok(result.eligible>0);
  assert.ok(result.singular>0);
  console.log('LOW_OUTPUT_RESIDUAL_CYCLE_PEER '+JSON.stringify(result));
});

module.exports={verify,invert,invertWithoutRankBound,sourcePermutation};
