'use strict';
const assert=require('node:assert/strict');

/**
 * Complete order census of every four-bit triangular Boolean permutation.
 *
 * A triangular permutation toggles bit i using only lower ORIGINAL bits.
 * There are 2 * 4 * 16 * 256 = 32,768 such permutations at width four.
 * Every permutation with k active gates has order dividing 2^k. This
 * enumerator also checks exact chosen-target inverses after conjugation by
 * a fixed, nonidentity invertible linear transformation.
 */

/**
 * @param {number[]} gates Gate truth tables, one for each bit 0..3.
 * @param {number} input Four-bit input.
 * @returns {number}
 */
function triangular(gates,input) {
  let result=input;
  for(let i=0;i<4;i++) {
    if((gates[i]>>>(input&((1<<i)-1)))&1)result^=1<<i;
  }
  return result;
}

/** @param {number[]} gates @returns {number} */
function activeGates(gates) {
  return gates.reduce((sum,g)=>(sum+(g!==0?1:0)),0);
}

/**
 * All orbit lengths of a compatible map are powers of two, hence its order
 * is their maximum. Enumerate every input and assert bijectivity.
 * @param {number[]} gates
 * @param {number[]} targetOrbits accumulates full target orbit-length counts
 * @returns {number}
 */
function permutationOrder(gates,targetOrbits) {
  const image=new Set();
  for(let input=0;input<16;input++)image.add(triangular(gates,input));
  assert.equal(image.size,16);
  let maximum=1;
  for(let input=0;input<16;input++) {
    let state=input,length=0;
    do {
      state=triangular(gates,state);
      length++;
      assert.ok(length<=16);
    } while(state!==input);
    assert.equal(length&(length-1),0);
    targetOrbits[Math.log2(length)]++;
    maximum=Math.max(maximum,length);
  }
  return maximum;
}

/**
 * @returns {{
 *   maps:number,byActive:number[],byOrder:number[],targetOrbits:number[],
 *   tightWitnesses:number[],atMostSevenQueries:number,
 *   conjugatedTargetChecks:number
 * }}
 */
function runTriangularOrderCensus() {
  const byActive=Array(5).fill(0);
  const byOrder=Array(5).fill(0);
  const targetOrbits=Array(5).fill(0);
  const tightWitnesses=Array(5).fill(0);
  const orders=[1,2,4,8,16];
  let maps=0,atMostSevenQueries=0,conjugatedTargetChecks=0;

  // A(x) = x XOR (8 if its low bit is set), so A=A^-1 and A is not I.
  const A=(/** @type {number} */ x)=>x^((x&1)?8:0);
  assert.equal(new Set(Array.from({length:16},(_,x)=>A(x))).size,16);

  for(let a=0;a<2;a++)for(let b=0;b<4;b++)
    for(let c=0;c<16;c++)for(let d=0;d<256;d++) {
      const gates=[a,b,c,d];
      const k=activeGates(gates);
      const order=permutationOrder(gates,targetOrbits);
      assert.equal((1<<k)%order,0);
      const orderIndex=orders.indexOf(order);
      assert.ok(orderIndex>=0);
      byActive[k]++;
      byOrder[orderIndex]++;
      maps++;
      if(order===(1<<k))tightWitnesses[k]++;
      if(order<=8)atMostSevenQueries++;

      // F=A^-1 P A. Cycle structure and inverse-by-forward-iteration
      // survive coordinate conjugation. Check every target directly.
      const F=(/** @type {number} */ x)=>A(triangular(gates,A(x)));
      for(let target=0;target<16;target++) {
        let preimage=target;
        for(let step=0;step<order-1;step++)preimage=F(preimage);
        assert.equal(F(preimage),target);
        conjugatedTargetChecks++;
      }
    }
  assert.equal(maps,32768);
  assert.deepEqual(byActive,[1,274,4908,16110,11475]);
  for(let k=0;k<=4;k++)assert.ok(tightWitnesses[k]>0);
  assert.equal(conjugatedTargetChecks,16*maps);
  assert.deepEqual(targetOrbits,[32768,131072,196608,131072,32768]);
  return {maps,byActive,byOrder,targetOrbits,tightWitnesses,
    atMostSevenQueries,conjugatedTargetChecks};
}

if(require.main===module) {
  process.stdout.write('TRIANGULAR_CONJUGATE_ORDER '+
    JSON.stringify(runTriangularOrderCensus())+'\n');
}

module.exports={runTriangularOrderCensus};
