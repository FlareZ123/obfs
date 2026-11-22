'use strict';

const assert=require('node:assert/strict');
const {randomInt}=require('node:crypto');

/**
 * @typedef {{rank:number,circuit:number,representation:(value:number)=>number|null}} ColumnSpace
 */

/**
 * Reduce unsigned binary column vectors. The first nonzero dependency mask
 * identifies a circuit among original column positions after XOR cancellation.
 * @param {number[]} columns
 * @param {number} width
 * @returns {ColumnSpace}
 */
function columnSpace(columns,width){
  /** @type {(number|null)[]} */
  const pivots=Array(width).fill(null);
  const witnesses=Array(width).fill(0);
  let rank=0, circuit=0;
  for(let index=0;index<columns.length;index++){
    let value=columns[index]>>>0;
    let witness=(2**index)>>>0;
    for(let bit=width-1;bit>=0;bit--){
      if(!((value>>>bit)&1))continue;
      const pivot=pivots[bit];
      if(pivot!==null){
        value=(value^pivot)>>>0;
        witness=(witness^witnesses[bit])>>>0;
      }else{
        pivots[bit]=value;
        witnesses[bit]=witness;
        rank++;
        break;
      }
    }
    if(value===0&&circuit===0)circuit=witness;
  }
  /** @param {number} target @returns {number|null} */
  function representation(target){
    let value=target>>>0;
    let mask=0;
    for(let bit=width-1;bit>=0;bit--){
      if(!((value>>>bit)&1))continue;
      const pivot=pivots[bit];
      if(pivot===null)return null;
      value=(value^pivot)>>>0;
      mask=(mask^witnesses[bit])>>>0;
    }
    return value===0?mask:null;
  }
  return {rank,circuit,representation};
}

/** @param {number} value @returns {number} */
function bitCount(value){
  let count=0;
  for(let state=value>>>0;state!==0;state=(state&(state-1))>>>0)count++;
  return count;
}

/** @param {number} mask @param {number} width @returns {number} */
function firstBit(mask,width){
  for(let index=0;index<width;index++)if((mask>>>index)&1)return index;
  throw new RangeError('Expected nonzero basis replacement mask');
}

/**
 * Discover a common input/output basis of an arbitrary fixed GF(2)^n
 * permutation using only a forward oracle. The default sampler draws an
 * independent uniform unsigned n-bit integer. Finite trial caps are an
 * explicit refusal rather than a false guarantee.
 *
 * For a current output span of dimension s<n, a dependency circuit has
 * at least 3 positions. Condition the sampled input on using one of these
 * positions. Since the image of the output span has only 2^s members,
 * each valid sample independently improves output rank with probability
 * at least 3/7. Thus each successful rank repair needs at most 7/3
 * expected fresh oracle evaluations under the uniform sampler.
 *
 * @param {(x:number)=>number} oracle Fixed permutation on n-bit words
 * @param {number} width Integer 2 through 32
 * @param {(exclusiveMax:number)=>number} [sample] Uniform by default
 * @param {number} [maxDraws]
 * @returns {{basis:number[],outputs:number[],initialRank:number,
 *   finalRank:number,replacements:number,draws:number,validTrials:number,
 *   oracleCalls:number}}
 */
function findCommonBasis(oracle,width,sample=randomInt,maxDraws=Infinity){
  if(!Number.isInteger(width)||width<2||width>32)
    throw new RangeError('width must be 2..32');
  if(!Number.isSafeInteger(maxDraws)&&maxDraws!==Infinity ||
     maxDraws<0)throw new RangeError('maxDraws must be nonnegative');
  const limit=2**width;
  /** @type {Map<number,number>} */
  const ledger=new Map();
  /** @param {number} x @returns {number} */
  function call(x){
    if(ledger.has(x))return /** @type {number} */(ledger.get(x));
    const output=oracle(x);
    if(!Number.isInteger(output)||output<0||output>=limit)
      throw new RangeError('Oracle must return unsigned n-bit integers');
    ledger.set(x,output);
    return output;
  }
  const zero=call(0);
  const basis=Array.from({length:width},(_,bit)=>(2**bit)>>>0);
  /** @type {number[]} */
  let outputs=basis.map(x=>(call(x)^zero)>>>0);
  let space=columnSpace(outputs,width);
  const initialRank=space.rank;
  let replacements=0,draws=0,validTrials=0;
  while(space.rank<width){
    assert.ok(bitCount(space.circuit)>=3,
      'Permutation must give nonzero distinct output differences');
    const inputs=columnSpace(basis,width);
    assert.equal(inputs.rank,width,'Input basis invariant');
    const circuit=space.circuit;
    let improved=false;
    while(draws<maxDraws){
      draws++;
      const candidate=sample(limit);
      if(!Number.isInteger(candidate)||candidate<0||candidate>=limit)
        throw new RangeError('Sampler must produce in-domain integers');
      const coordinates=inputs.representation(candidate);
      assert.notEqual(coordinates,null);
      const possible=(/** @type {number} */(coordinates)&circuit)>>>0;
      if(possible===0)continue;
      validTrials++;
      const image=(call(candidate)^zero)>>>0;
      if(space.representation(image)!==null)continue;
      const position=firstBit(possible,width);
      basis[position]=candidate;
      outputs[position]=image;
      const next=columnSpace(outputs,width);
      assert.equal(next.rank,space.rank+1,'Every accepted sample raises rank once');
      space=next;
      replacements++;
      improved=true;
      break;
    }
    if(!improved)throw new RangeError('Common-basis sampling cap exhausted');
  }
  return {basis,outputs,initialRank,finalRank:space.rank,replacements,
    draws,validTrials,oracleCalls:ledger.size};
}

/** @param {number} seed @returns {(max:number)=>number} */
function seededSampler(seed){
  let word=seed>>>0;
  assert.notEqual(word,0);
  return max=>{
    word^=word<<13;
    word^=word>>>17;
    word^=word<<5;
    return (word>>>0)%max;
  };
}

/**
 * @param {number} width
 * @param {(mapping:number[])=>void} consume
 * @returns {number}
 */
function allZeroFixedPermutations(width,consume){
  if(width!==3)throw new RangeError('The exhaustive checker is width 3');
  const items=[1,2,3,4,5,6,7];
  let count=0;
  /** @param {number} depth @returns {void} */
  function visit(depth){
    if(depth===items.length){count++;consume([0,...items]);return;}
    for(let index=depth;index<items.length;index++){
      [items[depth],items[index]]=[items[index],items[depth]];
      visit(depth+1);
      [items[depth],items[index]]=[items[index],items[depth]];
    }
  }
  visit(0);
  return count;
}

/** @returns {void} */
function main(){
  /** @type {Map<number,number>} */
  const frequency=new Map();
  const pick=seededSampler(20261122);
  let touched=0, maxTrials=0, maxCalls=0;
  const count=allZeroFixedPermutations(3,mapping=>{
    const result=findCommonBasis(x=>mapping[x],3,pick,10000);
    assert.equal(result.finalRank,3);
    assert.equal(result.replacements,3-result.initialRank);
    const output=columnSpace(result.basis.map(x=>mapping[x]^mapping[0]),3);
    assert.equal(output.rank,3);
    if(result.replacements)touched++;
    maxTrials=Math.max(maxTrials,result.validTrials);
    maxCalls=Math.max(maxCalls,result.oracleCalls);
    frequency.set(result.initialRank,(frequency.get(result.initialRank)??0)+1);
  });
  assert.equal(count,5040);
  assert.equal(touched,1008);
  assert.deepEqual(Object.fromEntries(frequency),{'2':1008,'3':4032});
  /** @type {Map<number,number>} */
  const swaps=new Map();
  // Map all 26 high basis columns into the independent 6-bit output span
  // with disjoint transpositions. The source remains a full 32-bit bijection.
  const targets=Array.from({length:63},(_,index)=>index+1).filter(
    x=>!Number.isInteger(Math.log2(x)));
  assert.ok(targets.length>=26);
  for(let index=6;index<32;index++){
    const high=(2**index)>>>0;
    const low=targets[index-6];
    swaps.set(high,low);
    swaps.set(low,high);
  }
  const first=columnSpace(Array.from({length:32},(_,bit)=>{
    const x=(2**bit)>>>0;
    return swaps.get(x)??x;
  }),32);
  assert.equal(first.rank,6);
  const hard=findCommonBasis(x=>swaps.get(x)??x,32,seededSampler(20261123),100000);
  assert.equal(hard.initialRank,6);
  assert.equal(hard.finalRank,32);
  assert.equal(hard.replacements,26);
  assert.equal(columnSpace(hard.outputs,32).rank,32);
  console.log('COMMON_BASIS_RANDOM_REPAIR '+JSON.stringify({
    width3:{permutations:count,repairs:touched,maxValidTrials:maxTrials,
      maxOracleCalls:maxCalls,initialRanks:Object.fromEntries(frequency)},
    width32:{rankBefore:hard.initialRank,rankAfter:hard.finalRank,
      replacements:hard.replacements,draws:hard.draws,
      validTrials:hard.validTrials,oracleCalls:hard.oracleCalls},
    theoreticalSuccessProbabilityAtLeast:'3/7',
    theoreticalExpectedQueriesPerRepairAtMost:'7/3'
  }));
}

if(require.main===module)main();
module.exports={findCommonBasis,columnSpace,seededSampler,
  allZeroFixedPermutations,main};
