'use strict';
const assert=require('node:assert/strict');

/**
 * Fully exact integer-arithmetic check of an adaptive quadratic polar learner's
 * claimed rank-certificate failure probability. The source implementation
 * under review is deliberately not imported.
 *
 * Stage 0 is rank 0; after the first success, stage 1 is rank 2.
 * Stage j>=1 is certified rank j+1. Stage k-1 is absorbing rank k.
 * For an unfinished rank r, each fresh kernel/full-vector pair succeeds with
 * conditional probability at least (1-2^(r-k))/2. Integer arithmetic avoids
 * floating point tail-rounding at the 10^-10 release criterion.
 */

/** @param {number} k @returns {number} */
function denominator(k){return 2**(k+1);}

/**
 * @param {number} k
 * @param {number} stage
 * @returns {bigint} Numerator of pessimistic transition probability.
 */
function successNumerator(k,stage){
  const r=stage===0?0:stage+1;
  return BigInt((2**(k-r)-1)*2**r);
}

/**
 * Counts at each stage after the specified trials under common denominator.
 * @param {number} k
 * @param {number} trials
 * @returns {{failure:bigint,denominator:bigint,success:bigint}}
 */
function exactTail(k,trials){
  assert.ok(Number.isInteger(k)&&k>=4&&k<=6);
  assert.ok(Number.isInteger(trials)&&trials>=0&&trials<=1000);
  const D=BigInt(denominator(k));
  /** @type {bigint[]} */
  let state=Array(k).fill(0n);
  state[0]=1n;
  let scale=1n;
  for(let step=0;step<trials;step++){
    /** @type {bigint[]} */
    const next=Array(k).fill(0n);
    for(let j=0;j<k;j++){
      if(j===k-1){
        next[j]+=state[j]*D;
        continue;
      }
      const p=successNumerator(k,j);
      assert.ok(p>0n&&p<D);
      next[j]+=state[j]*(D-p);
      next[j+1]+=state[j]*p;
    }
    scale*=D;
    state=next;
    assert.equal(state.reduce((a,b)=>a+b,0n),scale);
  }
  const failure=state.slice(0,-1).reduce((a,b)=>a+b,0n);
  const success=state[k-1];
  assert.equal(failure+success,scale);
  return {failure,denominator:scale,success};
}

/**
 * @param {number} k
 * @param {bigint} targetDenominator
 * @returns {{trials:number,missProbability:number,previousMissProbability:number,
 *    hardQueryCap32:number,failureNumerator:string,denominator:string}}
 */
function minimumTrials(k,targetDenominator){
  for(let trials=1;trials<500;trials++){
    const current=exactTail(k,trials);
    if(current.failure*targetDenominator<=current.denominator){
      const prior=exactTail(k,trials-1);
      assert.ok(prior.failure*targetDenominator>prior.denominator);
      return {
        trials,
        missProbability:Number(current.failure)/Number(current.denominator),
        previousMissProbability:Number(prior.failure)/Number(prior.denominator),
        hardQueryCap32:33+3*trials+k*32+k*(k-1)/2,
        failureNumerator:current.failure.toString(),
        denominator:current.denominator.toString()
      };
    }
  }
  throw Error('Trial cap too small');
}
function main(){
  const evidence=[4,5,6].map(k=>({rank:k,...minimumTrials(k,10n**10n)}));
  assert.deepEqual(evidence.map(x=>x.trials),[87,90,92]);
  assert.deepEqual(evidence.map(x=>x.hardQueryCap32),[428,473,516]);
  for(const row of evidence){
    assert.ok(row.missProbability<1e-10);
    assert.ok(row.previousMissProbability>1e-10);
  }
  console.log('RANK_K_EXACT_TAIL_PEER '+JSON.stringify({
    independentFromReviewedLearner:true,model:'pessimistic absorbing exact-rank certificate',
    criterion:'Pr[miss] <= 1/10^10 using exact BigInt rational comparisons',
    results:evidence
  }));
}
if(require.main===module)main();
module.exports={exactTail,minimumTrials,main};
