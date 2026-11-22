'use strict';
const assert = require('node:assert/strict');

/**
 * Enumerate all 8! functions through an independent exhaustive direct-table
 * oracle. Only bijective maps are generated. The inverse of the sampled
 * linear interpolant is a lookup table instead of Gaussian elimination.
 * @param {number[]} values
 * @param {(value:number[])=>void} visit
 * @param {number} [offset]
 * @returns {void}
 */
function permute(values,visit,offset=0) {
  if (offset===values.length) {visit(values);return;}
  for (let i=offset;i<values.length;i++) {
    [values[i],values[offset]]=[values[offset],values[i]];
    permute(values,visit,offset+1);
    [values[i],values[offset]]=[values[offset],values[i]];
  }
}

/** @returns {void} */
function main() {
  /** @type {Map<number,number>} */
  const counts=new Map([[0,0],[1,0],[2,0],[3,0]]);
  /** @type {Map<number,number>} */
  const maxQueries=new Map([[0,0],[1,0],[2,0],[3,0]]);
  let permutations=0;
  let singular=0;
  let targets=0;
  permute([0,1,2,3,4,5,6,7],F=>{
    permutations++;
    const b=F[0];
    const columns=[F[1]^b,F[2]^b,F[4]^b];
    /** @param {number} x @returns {number} */
    function M(x) {
      return (x&1?columns[0]:0)^(x&2?columns[1]:0)^(x&4?columns[2]:0);
    }
    const inverse=new Map();
    for(let x=0;x<8;x++)inverse.set(M(x),x);
    if(inverse.size!==8) {singular++;return;}
    const residualSpan=new Set([0]);
    for(let x=0;x<8;x++) {
      const residual=F[x]^b^M(x);
      for(const element of [...residualSpan])residualSpan.add(element^residual);
    }
    const r=Math.log2(residualSpan.size);
    assert.ok(Number.isInteger(r) && r<=3);
    counts.set(r,/** @type {number} */(counts.get(r))+1);
    for(let secret=0;secret<8;secret++) {
      const target=F[secret];
      const z=/** @type {number} */(inverse.get(target^b));
      let state=z;
      const oracleInputs=new Set([0,1,2,4]);
      for(let step=0;step<2**r-1;step++) {
        oracleInputs.add(state);
        const next=/** @type {number} */(inverse.get(F[state]^b));
        if(next===z)break;
        state=next;
      }
      assert.equal(state,secret);
      assert.ok(oracleInputs.size<=3+2**r);
      maxQueries.set(r,Math.max(/** @type {number} */(maxQueries.get(r)),oracleInputs.size));
      targets++;
    }
  });
  const rankCounts=Object.fromEntries(counts);
  const observedMaxQueries=Object.fromEntries(maxQueries);
  assert.equal(permutations,40320);
  assert.equal(singular,8064);
  assert.deepEqual(rankCounts,{'0':1344,'1':8064,'2':14784,'3':8064});
  assert.equal(targets,258048);
  assert.deepEqual(observedMaxQueries,{'0':4,'1':5,'2':7,'3':8});
  console.log(JSON.stringify({permutations,singular,rankCounts,
    recoveredTargets:targets,observedMaxQueries},null,2));
}
if(require.main===module)main();
module.exports={main,permute};
