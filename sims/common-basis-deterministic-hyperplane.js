'use strict';

const assert=require('node:assert/strict');
const {columnSpace,seededSampler}=require('./low-output-common-basis-repair');

/**
 * Complete an adversarial deterministic forward-oracle transcript into a
 * full fixed bijection whose images of a proposed basis lie in one output
 * hyperplane. This is an executable sanity check for the counting lemma.
 *
 * @param {number} width
 * @param {readonly number[]} queried Distinct queried x, possibly including 0
 * @param {readonly number[]} proposed Input vectors forming a basis
 * @returns {number[]} Complete permutation table
 */
function hyperplaneCompletion(width,queried,proposed){
  if(!Number.isInteger(width)||width<2||width>8)
    throw new RangeError('Demo width must be 2..8');
  const size=2**width;
  const half=size/2;
  assert.equal(new Set(queried).size,queried.length);
  assert.equal(new Set(proposed).size,proposed.length);
  assert.equal(proposed.length,width);
  assert.equal(columnSpace([...proposed],width).rank,width);
  assert.ok(queried.length+width+1<=half,
    'Enough hyperplane images must remain for arbitrary proposed basis');
  /** @type {Map<number,number>} */
  const chosen=new Map([[0,0]]);
  let nextOutput=1;
  for(const input of [...queried,...proposed]){
    assert.ok(Number.isInteger(input)&&input>=0&&input<size);
    if(!chosen.has(input)){
      assert.ok(nextOutput<half,'Cannot overfill output hyperplane');
      chosen.set(input,nextOutput++);
    }
  }
  /** @type {number[]} */
  const mapping=Array(size).fill(-1);
  const seenImages=new Set(chosen.values());
  for(const [input,output] of chosen)mapping[input]=output;
  const remaining=Array.from({length:size},(_,i)=>i).filter(
    value=>!seenImages.has(value));
  let offset=0;
  for(let input=0;input<size;input++){
    if(mapping[input]===-1)mapping[input]=remaining[offset++];
  }
  assert.equal(offset,remaining.length);
  assert.equal(new Set(mapping).size,size,'Must complete to genuine permutation');
  assert.equal(mapping[0],0);
  for(const input of queried)assert.ok(mapping[input]<half,
    'Every oracle response stayed inside output hyperplane');
  assert.ok(columnSpace(proposed.map(input=>mapping[input]),width).rank<width,
    'Proposed common basis must fail for completed legal permutation');
  return mapping;
}

/**
 * @param {number} width
 * @param {(max:number)=>number} pick
 * @returns {number[]}
 */
function sampledBasis(width,pick){
  const size=2**width;
  /** @type {number[]} */
  const basis=[];
  while(basis.length<width){
    const candidate=pick(size);
    if(candidate!==0 && columnSpace([...basis,candidate],width).rank>
      basis.length)basis.push(candidate);
  }
  return basis;
}

/** @returns {void} */
function main(){
  const pick=seededSampler(20261122);
  const width=5;
  const half=2**(width-1);
  let checked=0,minRank=width,maxRank=0;
  for(let trial=0;trial<2000;trial++){
    const basis=sampledBasis(width,pick);
    const queries=new Set([0]);
    while(queries.size<10)queries.add(pick(2**width));
    const mapping=hyperplaneCompletion(width,[...queries],basis);
    const rank=columnSpace(basis.map(input=>mapping[input]),width).rank;
    minRank=Math.min(minRank,rank);
    maxRank=Math.max(maxRank,rank);
    checked++;
  }
  assert.equal(half,16);
  assert.equal(minRank,4);
  assert.equal(maxRank,4);
  const standard=[1,2,4,8,16];
  const boundary=hyperplaneCompletion(5,[0,3,5,6,7,9,10,11,12,13],standard);
  assert.equal(columnSpace(standard.map(x=>boundary[x]),5).rank,4);
  console.log('COMMON_BASIS_DETERMINISTIC_HYPERPLANE '+JSON.stringify({
    width,hyperplaneSize:half,distinctQueryBudget:10,
    proposedBasisSize:width,trials:checked,minRank,maxRank,
    lowerBoundFormula:'q^(n-1)-n'
  }));
}
if(require.main===module)main();
module.exports={hyperplaneCompletion,sampledBasis,main};
