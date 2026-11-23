'use strict';
const assert=require('node:assert/strict');

/**
 * Exact law for uniformly random triangular permutations on n GF(2) bits.
 *
 * The model independently chooses each gate truth table uniformly, yielding
 * the uniform finite iterated binary-wreath-product subgroup of permutations.
 * It is a distribution over full truth tables, NOT a seeded small-code family.
 */

/**
 * @param {number} width Integer bit width in [0,32].
 * @returns {{
 *   width:number,orderCdf:number[],orderProbability:number[],
 *   targetOrbitProbability:number[],medianOrderExponent:number,
 *   medianTargetExponent:number,meanOrder:number,
 *   meanTargetOrbit:number,maxOrderProbability:number
 * }}
 */
function uniformTriangularOrderLaw(width) {
  assert.ok(Number.isInteger(width)&&width>=0&&width<=32);
  /** @type {number[]} */
  let previous=[1];
  for(let n=1;n<=width;n++) {
    const next=Array(n+1).fill(0);
    for(let m=0;m<=n;m++) {
      const a=m>=n-1?1:previous[m];
      const b=m===0?0:(m-1>=n-1?1:previous[m-1]);
      next[m]=(a*a+b)/2;
    }
    previous=next;
  }
  const orderCdf=previous;
  const orderProbability=orderCdf.map((v,i)=>v-(i===0?0:orderCdf[i-1]));
  const targetOrbitProbability=[];
  let combinations=1;
  for(let j=0;j<=width;j++) {
    targetOrbitProbability.push(combinations/2**width);
    combinations=combinations*(width-j)/(j+1);
  }
  const medianOrderExponent=orderCdf.findIndex(v=>v>=0.5);
  let targetCumulative=0;
  let medianTargetExponent=-1;
  for(let j=0;j<=width;j++) {
    targetCumulative+=targetOrbitProbability[j];
    if(targetCumulative>=0.5&&medianTargetExponent<0)medianTargetExponent=j;
  }
  const meanOrder=orderProbability.reduce((sum,p,i)=>sum+p*2**i,0);
  const meanTargetOrbit=targetOrbitProbability.reduce((sum,p,i)=>sum+p*2**i,0);
  return {
    width,orderCdf,orderProbability,targetOrbitProbability,
    medianOrderExponent,medianTargetExponent,meanOrder,meanTargetOrbit,
    maxOrderProbability:orderProbability[width]
  };
}

if(require.main===module) {
  for(const width of [4,8,16,24,32]) {
    process.stdout.write('UNIFORM_TRIANGULAR_ORDER_LAW '+
      JSON.stringify(uniformTriangularOrderLaw(width))+'\n');
  }
}
module.exports={uniformTriangularOrderLaw};
