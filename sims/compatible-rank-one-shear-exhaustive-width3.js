'use strict';

const assert=require('node:assert/strict');

const WIDTH=3;
const SIZE=1<<WIDTH;

/** @param {number[]} columns @param {number} input @returns {number} */
function applyLinear(columns,input) {
  let output=0;
  for(let bit=0;bit<WIDTH;bit++) {
    if((input&(1<<bit))!==0)output^=columns[bit];
  }
  return output;
}

/** @param {number[]} columns @returns {number} */
function rank(columns) {
  const pivots=Array(WIDTH).fill(0);
  let count=0;
  for(const column of columns) {
    let value=column;
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

/** @param {number[]} columns @param {number} rhs @returns {number[]} */
function preimages(columns,rhs) {
  const found=[];
  for(let input=0;input<SIZE;input++) {
    if(applyLinear(columns,input)===rhs)found.push(input);
  }
  return found;
}

/** @returns {number[][]} */
function invertibleMatrices() {
  const matrices=[];
  for(let a=1;a<SIZE;a++)for(let b=1;b<SIZE;b++)for(let c=1;c<SIZE;c++) {
    const columns=[a,b,c];
    if(rank(columns)===WIDTH)matrices.push(columns);
  }
  return matrices;
}

/**
 * Independently implement the n+3 inversion argument using only published
 * oracle values and brute-force linear solves at this tiny width.
 * @param {number[]} oracle
 * @param {number} target
 * @returns {{value:number,queries:number,interpolantRank:number}}
 */
function invert(oracle,target) {
  /** @type {Map<number,number>} */
  const cache=new Map();
  /** @param {number} input @returns {number} */
  function query(input) {
    if(!cache.has(input))cache.set(input,oracle[input]);
    return /** @type {number} */ (cache.get(input));
  }

  const base=query(0);
  const columns=Array.from({length:WIDTH},(_,bit)=>query(1<<bit)^base);
  const interpolantRank=rank(columns);
  const targetOffset=target^base;

  if(interpolantRank===WIDTH) {
    const direct=preimages(columns,targetOffset);
    assert.equal(direct.length,1);
    const candidate=direct[0];
    const observed=query(candidate);
    if(observed===target)return {value:candidate,queries:cache.size,interpolantRank};
    const correction=preimages(columns,observed^target);
    assert.equal(correction.length,1);
    return {
      value:candidate^correction[0],
      queries:cache.size,
      interpolantRank
    };
  }

  assert.equal(interpolantRank,WIDTH-1);
  const kernel=preimages(columns,0).filter(value=>value!==0);
  assert.equal(kernel.length,1);
  const direction=kernel[0];
  const outputDirection=query(direction)^base;
  let solutions=preimages(columns,targetOffset);
  if(solutions.length===0)solutions=preimages(columns,targetOffset^outputDirection);
  assert.equal(solutions.length,2);
  const candidate=solutions[0];
  return {
    value:query(candidate)===target?candidate:candidate^direction,
    queries:cache.size,
    interpolantRank
  };
}

function main() {
  const matrices=invertibleMatrices();
  assert.equal(matrices.length,168);

  let checkedForms=0;
  let permutationForms=0;
  let invarianceViolations=0;
  let maxQueries=0;
  const attackRankCounts={2:0,3:0};

  for(const matrix of matrices) {
    /** @type {Map<number,number>} */
    const inverse=new Map();
    for(let input=0;input<SIZE;input++)inverse.set(applyLinear(matrix,input),input);

    for(let outputDirection=1;outputDirection<SIZE;outputDirection++) {
      const hiddenDirection=/** @type {number} */ (inverse.get(outputDirection));
      for(let functionMask=0;functionMask<(1<<SIZE);functionMask++) {
        checkedForms++;
        const oracle=Array.from({length:SIZE},(_,input)=>
          applyLinear(matrix,input)^
          (((functionMask>>input)&1)!==0?outputDirection:0));
        if(new Set(oracle).size!==SIZE)continue;

        permutationForms++;
        for(let input=0;input<SIZE;input++) {
          const left=(functionMask>>input)&1;
          const right=(functionMask>>(input^hiddenDirection))&1;
          if(left!==right)invarianceViolations++;
        }

        for(let secret=0;secret<SIZE;secret++) {
          const result=invert(oracle,oracle[secret]);
          assert.equal(result.value,secret);
          assert.ok(result.queries<=WIDTH+3);
          attackRankCounts[/** @type {2|3} */ (result.interpolantRank)]++;
          maxQueries=Math.max(maxQueries,result.queries);
        }
      }
    }
  }

  assert.equal(checkedForms,301056);
  assert.equal(permutationForms,18816);
  assert.equal(invarianceViolations,0);
  assert.deepEqual(attackRankCounts,{2:10752,3:139776});
  assert.equal(maxQueries,WIDTH+3);

  console.log(JSON.stringify({
    width:WIDTH,
    checkedForms,
    permutationForms,
    invarianceViolations,
    recoveredTargets:attackRankCounts[2]+attackRankCounts[3],
    attackRankCounts,
    maxQueries,
    claimedBound:WIDTH+3
  }));
}

if(require.main===module)main();
