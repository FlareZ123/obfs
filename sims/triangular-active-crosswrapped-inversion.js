'use strict';
const assert=require('node:assert/strict');
const {invertLowRankDeterministic}=require('./affine-low-rank-oracle');

/**
 * Cross-wrapper chosen-query inverse test of the established low-rank theorem,
 * specifically for triangular maps with k active output coordinates.
 *
 * All random-looking seeds and inputs are deterministic; no secret generator
 * is passed to the attacker, only a black-box forward callback and k.
 */

/** @param {number} x @returns {number} */
function parity32(x) {
  let v=x>>>0;
  v^=v>>>16;
  v^=v>>>8;
  v^=v>>>4;
  return (0x6996>>>(v&15))&1;
}

/** @param {number} seed @returns {()=>number} */
function seeded(seed) {
  let v=seed>>>0;
  return ()=>{
    v^=v<<13;v^=v>>>17;v^=v<<5;
    return v>>>0;
  };
}

/** @param {number[]} columns @param {number} x @returns {number} */
function applyLinear(columns,x) {
  let out=0;
  for(let i=0;i<32;i++)if((x>>>i)&1)out^=columns[i];
  return out>>>0;
}

/**
 * @param {number} seed
 * @returns {number[]} Invertible GF(2) matrix as its 32 columns.
 */
function invertible(seed) {
  const next=seeded(seed);
  const columns=Array.from({length:32},(_,i)=>(1<<i)>>>0);
  for(let round=0;round<288;round++){
    const a=next()%32,b=next()%32;
    if(a===b)continue;
    if(next()&1)[columns[a],columns[b]]=[columns[b],columns[a]];
    else columns[a]=(columns[a]^columns[b])>>>0;
  }
  return columns;
}

/**
 * @param {number} x
 * @param {number} bit
 * @param {number} seed
 * @returns {0|1}
 */
function gate(x,bit,seed) {
  if(bit===0)return 1;
  const lowerMask=(2**bit-1)>>>0;
  const lower=x&lowerMask;
  // The bit below this output coordinate is not fed into nonlinear mix,
  // guaranteeing a genuinely nonconstant gate even for a high coordinate.
  const high=((x>>>(bit-1))&1);
  const nonlinearMask=bit>=2 ? (2**(bit-1)-1)>>>0:0;
  const v=lower&nonlinearMask;
  const mixed=(Math.imul((v^seed)>>>0,0x9e3779b1)^
    Math.imul((v>>>3)^(seed>>>7),0x7f4a7c15))>>>0;
  return /** @type {0|1} */ ((high ^ parity32(mixed))&1);
}

/**
 * @param {number} seed
 * @param {number} active
 * @returns {{oracle:(x:number)=>number,activeCoordinates:number[]}}
 */
function source(seed,active) {
  const next=seeded((seed^0x61d2b5a7)>>>0);
  const inputMatrix=invertible(next());
  const outputMatrix=invertible(next());
  const inOffset=next(),outOffset=next();
  /** @type {number[]} */
  const activeCoordinates=[];
  while(activeCoordinates.length<active) {
    const bit=next()%32;
    if(!activeCoordinates.includes(bit))activeCoordinates.push(bit);
  }
  activeCoordinates.sort((a,b)=>a-b);
  const salts=activeCoordinates.map(()=>next());
  // The matrices really are independent, not an accidental conjugation.
  assert.ok(Array.from({length:32},(_,bit)=>
    applyLinear(outputMatrix,applyLinear(inputMatrix,(1<<bit)>>>0))).
    some((value,bit)=>value!==((1<<bit)>>>0)));
  /** @param {number} x @returns {number} */
  function oracle(x) {
    const input=(applyLinear(inputMatrix,x)^inOffset)>>>0;
    let output=input;
    for(let i=0;i<activeCoordinates.length;i++){
      const bit=activeCoordinates[i];
      if(gate(input,bit,salts[i]))output=(output^(1<<bit))>>>0;
    }
    return (applyLinear(outputMatrix,output)^outOffset)>>>0;
  }
  return {oracle,activeCoordinates};
}

/**
 * @param {number[]} vectors
 * @returns {number}
 */
function rank(vectors) {
  const pivots=Array(32).fill(0);
  let result=0;
  for(const raw of vectors){
    let v=raw>>>0;
    for(let i=31;i>=0&&v!==0;i--){
      if(!((v>>>i)&1))continue;
      if(pivots[i])v=(v^pivots[i])>>>0;
      else{pivots[i]=v;result++;break;}
    }
  }
  return result;
}

/**
 * @returns {{sources:number,targets:number,exactInversions:number,
 *   maximumQueries:number,maximumNullity:number,
 *   upperBoundViolations:number,sampledRankViolations:number,
 *   byK:{k:number,sources:number,targets:number,maxCalls:number}[]}}
 */
function runCrosswrappedActiveTriangularAttack() {
  const byK=[];
  let sources=0,targets=0,exactInversions=0,maximumQueries=0;
  let maximumNullity=0,upperBoundViolations=0,sampledRankViolations=0;
  for(let k=1;k<=4;k++){
    let localSources=0,localTargets=0,maxCalls=0;
    for(let run=0;run<12;run++){
      const seed=(0x478c941e^Math.imul(k,0x3c6ef35f)^
        Math.imul(run,0x9e3779b1))>>>0;
      const built=source(seed,k);
      const {oracle,activeCoordinates}=built;
      assert.equal(activeCoordinates.length,k);
      const next=seeded((seed^0xb706ca11)>>>0);
      const constant=oracle(0);
      const affineColumns=Array.from({length:32},(_,bit)=>
        (oracle((1<<bit)>>>0)^constant)>>>0);
      const residuals=Array.from({length:96},()=> {
        const x=next();
        return (oracle(x)^constant^applyLinear(affineColumns,x))>>>0;
      });
      if(rank(residuals)>k)sampledRankViolations++;
      for(let t=0;t<3;t++){
        const secret=next();
        const target=oracle(secret);
        const inversion=invertLowRankDeterministic(oracle,target,{
          bits:32,rankBound:k
        });
        const valid=oracle(inversion.preimage)===target&&
          inversion.preimage===secret;
        assert.ok(valid,'An invertible wrapped triangular source has one preimage');
        const bound=33+2**(2*k);
        if(inversion.oracleCalls>bound)upperBoundViolations++;
        maxCalls=Math.max(maxCalls,inversion.oracleCalls);
        maximumQueries=Math.max(maximumQueries,inversion.oracleCalls);
        maximumNullity=Math.max(maximumNullity,inversion.nullity);
        localTargets++;targets++;exactInversions++;
      }
      localSources++;sources++;
    }
    byK.push({k,sources:localSources,targets:localTargets,maxCalls});
  }
  assert.equal(sources,48);
  assert.equal(targets,144);
  assert.equal(exactInversions,targets);
  assert.equal(sampledRankViolations,0);
  assert.equal(upperBoundViolations,0);
  return {sources,targets,exactInversions,maximumQueries,maximumNullity,
    upperBoundViolations,sampledRankViolations,byK};
}

/**
 * An all-32-active-coordinate triangular source with only t genuinely
 * nonlinear coordinate gates. Every remaining gate has a nonzero affine
 * control on lower input bits, including a constant-one bit-zero gate.
 * The t nonlinear controls use independent squarefree monomials, so their
 * degree-two ANF output coefficient span has rank exactly t.
 *
 * @param {number} seed
 * @param {number} nonlinearCount
 * @returns {{oracle:(input:number)=>number,activeCoordinates:number,
 *   nonlinearCoordinates:number[]}}
 */
function affineHeavySource(seed,nonlinearCount) {
  assert.ok(Number.isInteger(nonlinearCount)&&nonlinearCount>=1&&
    nonlinearCount<=4);
  const next=seeded((seed^0x821755d7)>>>0);
  const inputMatrix=invertible(next()),outputMatrix=invertible(next());
  const inOffset=next(),outOffset=next();
  const nonlinearCoordinates=[6,12,19,27].slice(0,nonlinearCount);
  const quadraticPairs=[[0,1],[0,2],[1,2],[0,3]];
  /** @type {Map<number,number[]>} */
  const nonlinearPairs=new Map(nonlinearCoordinates.map((index,ordinal)=>
    [index,quadraticPairs[ordinal]]));
  const linearMasks=Array.from({length:32},(_,bit)=>
    bit===0?0:((next()&((2**bit-1)>>>0))|1)>>>0);
  const offsets=Array.from({length:32},()=>next()&1);
  // Neither wrapper depends on the inverse of the other.
  assert.ok(Array.from({length:32},(_,bit)=>
    applyLinear(outputMatrix,applyLinear(inputMatrix,(1<<bit)>>>0))).
    some((value,bit)=>value!==((1<<bit)>>>0)));
  /** @param {number} input @returns {number} */
  function oracle(input) {
    const z=(applyLinear(inputMatrix,input)^inOffset)>>>0;
    let out=z;
    for(let bit=0;bit<32;bit++){
      const affine=bit===0?1:(parity32(z&linearMasks[bit])^offsets[bit]);
      const pair=nonlinearPairs.get(bit);
      const nonlinear=pair?
        ((z>>>pair[0])&1)&((z>>>pair[1])&1):0;
      if(affine^nonlinear)out=(out^(1<<bit))>>>0;
    }
    return (applyLinear(outputMatrix,out)^outOffset)>>>0;
  }
  return {oracle,activeCoordinates:32,nonlinearCoordinates};
}

/**
 * Independently challenge a densely active triangular map by supplying
 * the *nonlinear* output rank t to the unchanged deterministic inverter.
 * The source has 32 nonidentity triangular gates, not just t active gates.
 *
 * @returns {{sources:number,targets:number,exactInversions:number,
 *   maximumQueries:number,maxNullity:number,exactSampleRanks:number,
 *   byNonlinear:{nonlinearCount:number,maxCalls:number,sources:number,
 *      targets:number}[]}}
 */
function runAffineHeavyTriangularAttack() {
  const byNonlinear=[];
  let sources=0,targets=0,exactInversions=0;
  let maximumQueries=0,maxNullity=0,exactSampleRanks=0;
  for(let t=1;t<=4;t++){
    let maxCalls=0,localSources=0,localTargets=0;
    for(let iteration=0;iteration<12;iteration++){
      const seed=(0x71f03b2c^Math.imul(t,0x6d2b79f5)^
        Math.imul(iteration+1,0x4f1bbcdc))>>>0;
      const built=affineHeavySource(seed,t);
      assert.equal(built.activeCoordinates,32);
      assert.equal(built.nonlinearCoordinates.length,t);
      const {oracle}=built;
      const next=seeded((seed^0xb7e9a039)>>>0);
      const base=oracle(0);
      const columns=Array.from({length:32},(_,bit)=>
        (oracle((1<<bit)>>>0)^base)>>>0);
      const residuals=Array.from({length:128},()=>{
        const input=next();
        return (oracle(input)^base^applyLinear(columns,input))>>>0;
      });
      assert.equal(rank(residuals),t,
        'Independent quadratic monomial controls must yield full residual rank');
      exactSampleRanks++;
      for(let trial=0;trial<3;trial++){
        const secret=next(),output=oracle(secret);
        const inverted=invertLowRankDeterministic(oracle,output,{
          bits:32,rankBound:t
        });
        assert.equal(inverted.preimage,secret);
        assert.equal(oracle(inverted.preimage),output);
        assert.ok(inverted.oracleCalls<=33+2**(2*t));
        maxCalls=Math.max(maxCalls,inverted.oracleCalls);
        maximumQueries=Math.max(maximumQueries,inverted.oracleCalls);
        maxNullity=Math.max(maxNullity,inverted.nullity);
        localTargets++;targets++;exactInversions++;
      }
      localSources++;sources++;
    }
    byNonlinear.push({nonlinearCount:t,maxCalls,
      sources:localSources,targets:localTargets});
  }
  assert.equal(sources,48);
  assert.equal(targets,144);
  assert.equal(exactInversions,targets);
  assert.equal(exactSampleRanks,sources);
  return {sources,targets,exactInversions,maximumQueries,maxNullity,
    exactSampleRanks,byNonlinear};
}

if(require.main===module){
  process.stdout.write('CROSSWRAPPED_TRIANGULAR_ACTIVE_INVERSION '+
    JSON.stringify(runCrosswrappedActiveTriangularAttack())+'\n');
}
module.exports={runCrosswrappedActiveTriangularAttack,runAffineHeavyTriangularAttack};
