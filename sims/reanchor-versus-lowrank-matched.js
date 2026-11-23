'use strict';

const {makeFixture}=
  require('./sparse-triangular-fixedpoint-inversion');
const {invertByReanchoring}=
  require('./random-affine-anchor-compatible-inversion');
const {invertLowRankDeterministic}=
  require('./affine-low-rank-oracle');
const {u32}=require('./compatible-permutation-linear-sandwich-blackbox');

/**
 * Compare two PUBLIC chosen-query inverters against identical original
 * four-interacting-shear source oracles and identical held-out targets.
 * The source generator privately validates a clean affine anchor. Neither
 * attack receives the source state, secret, affine keys, or gate layout.
 *
 * The second attacker has the stronger promise "nonlinear output rank
 * at most four", and is a real independent existing competitor.
 *
 * @returns {{sourceCount:number,targetCount:number,exact:number,
 *   winners:Record<string,number>,queries:Record<string,{min:number,max:number}>,
 *   rows:Array<{seed:number,target:'rare'|'ordinary',reanchorQueries:number,
 *     reanchorCorrections:number,lowRankQueries:number,lowRankOrbit:number,
 *     lowRankNullity:number}>}}
 */
function runEvidence() {
  /** @type {Array<{seed:number,target:'rare'|'ordinary',reanchorQueries:number,
   *   reanchorCorrections:number,lowRankQueries:number,lowRankOrbit:number,
   *   lowRankNullity:number}>} */
  const rows=[];
  /** @type {Record<string,number>} */
  const winners={reanchor:0,lowRank:0,tie:0};
  let exact=0;
  for(let index=0;index<12;index++) {
    const seed=u32(0x2026a114^Math.imul(index+1,0x9e3779b9));
    const source=makeFixture(seed);
    if(!source.anchorsClean)throw Error('Source generator violated clean anchor promise');
    for(const [label,secret] of /** @type {Array<['rare'|'ordinary',number]>} */
      ([['rare',source.secret],['ordinary',source.control]])) {
      const target=source.oracle(secret);
      const reanchor=invertByReanchoring(source.oracle,target,0,1,true);
      const lowRank=invertLowRankDeterministic(source.oracle,target,
        {bits:32,rankBound:4});
      if(reanchor.value!==secret||lowRank.preimage!==secret) {
        throw Error('Matched chosen-query method returned a wrong preimage');
      }
      if(reanchor.queries<lowRank.oracleCalls)winners.reanchor++;
      else if(reanchor.queries>lowRank.oracleCalls)winners.lowRank++;
      else winners.tie++;
      exact++;
      rows.push({seed:source.sourceSeed,target:label,
        reanchorQueries:reanchor.queries,
        reanchorCorrections:reanchor.corrections,
        lowRankQueries:lowRank.oracleCalls,
        lowRankOrbit:lowRank.orbitCalls,
        lowRankNullity:lowRank.nullity});
    }
  }
  return {sourceCount:12,targetCount:rows.length,exact,winners,
    queries:{
      reanchor:{min:Math.min(...rows.map(x=>x.reanchorQueries)),
        max:Math.max(...rows.map(x=>x.reanchorQueries))},
      lowRank:{min:Math.min(...rows.map(x=>x.lowRankQueries)),
        max:Math.max(...rows.map(x=>x.lowRankQueries))}
    },rows};
}

if(require.main===module)
  console.log('REANCHOR_VS_LOWRANK '+JSON.stringify(runEvidence()));
module.exports={runEvidence};
