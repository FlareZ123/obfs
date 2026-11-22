'use strict';

const assert=require('node:assert/strict');
const {
  findCommonBasis,columnSpace,seededSampler
}=require('./low-output-common-basis-repair');

/** @param {number} value @param {number} mode @returns {number} */
function testPermutation(value,mode){
  let result=value;
  if(value===3)result=4;
  else if(value===4)result=3;
  if(mode===2){
    if(value===24)result=32;
    else if(value===32)result=24;
    // A nontrivial invertible output linear map plus a nonzero offset
    // preserves permutation and output residual rank while shifting F(0).
    result=((result<<3)|(result>>>5))&255;
    result^=165;
  }
  return result;
}

/**
 * Convert z-coordinates through the current full-rank input basis.
 * @param {number[]} basis
 * @param {number} coordinates
 * @returns {number}
 */
function applyBasis(basis,coordinates){
  let result=0;
  for(let index=0;index<basis.length;index++){
    if((coordinates>>>index)&1)result^=basis[index];
  }
  return result>>>0;
}

/**
 * Recover the exact preimage of target by first finding a full-rank
 * affine calibration and then traversing the low-rank residual cycle.
 * The forward oracle is the only target-specific data source.
 *
 * @param {(x:number)=>number} oracle
 * @param {number} target
 * @param {number} residualRank
 * @param {(max:number)=>number} pick
 * @returns {{preimage:number,calibrationRankBefore:number,
 *   rankReplacements:number,cycleCalls:number,oracleCalls:number}}
 */
function invertWithRepairedBasis(oracle,target,residualRank,pick){
  /** @type {Map<number,number>} */
  const ledger=new Map();
  /** @param {number} x @returns {number} */
  function query(x){
    if(!ledger.has(x))ledger.set(x,oracle(x));
    return /** @type {number} */ (ledger.get(x));
  }
  const width=8;
  const c=query(0);
  const repaired=findCommonBasis(query,width,pick,2652);
  const span=columnSpace(repaired.outputs,width);
  assert.equal(span.rank,width);
  assert.equal(repaired.finalRank,width);
  const start=span.representation(target^c);
  assert.notEqual(start,null);
  let z=/** @type {number} */(start);
  const limit=2**residualRank;
  for(let step=1;step<=limit;step++){
    const input=applyBasis(repaired.basis,z);
    const image=query(input);
    const next=span.representation(image^c);
    assert.notEqual(next,null);
    if(next===start){
      assert.equal(query(input),target);
      return {preimage:input,calibrationRankBefore:repaired.initialRank,
        rankReplacements:repaired.replacements,cycleCalls:step,
        oracleCalls:ledger.size};
    }
    z=/** @type {number} */ (next);
  }
  throw new Error('Rank-r residual orbit exceeded claimed bound');
}

/** @returns {void} */
function main(){
  /** @type {{mode:number,rank:number,initialRank:number,targets:number,
   * maxCycleCalls:number,maxOracleCalls:number,totalOracleCalls:number}[]} */
  const results=[];
  for(const mode of [1,2]){
    const rank=mode;
    const source=/** @type {(x:number)=>number} */(x=>testPermutation(x,mode));
    const outputs=Array.from({length:256},(_,x)=>source(x));
    assert.equal(new Set(outputs).size,256,'Source must be a permutation');
    const zero=source(0);
    const first=columnSpace(Array.from({length:8},(_,j)=>source(2**j)^zero),8);
    assert.equal(first.rank,8-rank,'Canonical interpolant must be singular');
    /** @type {number[]} */
    const residuals=[];
    for(let x=0;x<256;x++){
      // For mode 2, its output linear map is byte-rotation by three;
      // for mode 1, it is the identity map.
      const affine=mode===1?x:(((x<<3)|(x>>>5))&255)^165;
      residuals.push(source(x)^affine);
    }
    assert.equal(columnSpace(residuals,8).rank,rank,
      'Global displacement image really lies in rank-r subspace');
    const pick=seededSampler(20261122+mode);
    let maxCycleCalls=0,maxOracleCalls=0,totalOracleCalls=0;
    for(const target of outputs){
      const inverse=invertWithRepairedBasis(source,target,rank,pick);
      assert.equal(source(inverse.preimage),target);
      assert.equal(inverse.calibrationRankBefore,8-rank);
      assert.equal(inverse.rankReplacements,rank);
      assert.ok(inverse.cycleCalls<=2**rank);
      maxCycleCalls=Math.max(maxCycleCalls,inverse.cycleCalls);
      maxOracleCalls=Math.max(maxOracleCalls,inverse.oracleCalls);
      totalOracleCalls+=inverse.oracleCalls;
    }
    results.push({mode,rank,initialRank:first.rank,targets:256,
      maxCycleCalls,maxOracleCalls,totalOracleCalls});
  }
  console.log('COMMON_BASIS_REPAIRED_CYCLE_INVERSION '+JSON.stringify(results));
}
if(require.main===module)main();
module.exports={main,testPermutation,invertWithRepairedBasis};
