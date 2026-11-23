'use strict';

const assert=require('node:assert/strict');
const {invertByReanchoring,poisonCanonicalAnchor}=
  require('./random-affine-anchor-compatible-inversion');
const {
  makeRng,makeLinearTransform,applyLinear,makeTriangularCompatiblePermutation,
  makeRivestPermutation,invertLinearSandwich,u32
}=require('./compatible-permutation-linear-sandwich-blackbox');

/**
 * One chosen-oracle adversary that first tries a cheap verified
 * reanchored triangular inversion, then the older structural CEGAR
 * attacker with calibrated and high-budget probes. Calls are deduped
 * across all attempts so the query count reflects actual remote work.
 *
 * Each sub-inverter verifies the candidate against the published
 * oracle. The wrapper independently checks every returned preimage.
 * An unrelated implementation exception remains visible to the test.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} target
 * @param {number} seed
 * @returns {{value:number,queries:number,method:'reanchor'|'cegar8'|'cegar128',
 *   failed:Array<{method:string,reason:string}>}}
 */
function invertHybrid(oracle,target,seed){
  if(!Number.isInteger(target)||target<0||target>0xffffffff) {
    throw new RangeError('Hybrid target must be an unsigned 32-bit integer');
  }
  /** @type {Map<number,number>} */
  const cached=new Map();
  /** @param {number} input @returns {number} */
  const query=input=>{
    const key=input>>>0;
    if(!cached.has(key)) {
      const output=oracle(key);
      if(!Number.isInteger(output)||output<0||output>0xffffffff) {
        throw new RangeError('Hybrid oracle result must be an unsigned 32-bit integer');
      }
      cached.set(key,output);
    }
    return /** @type {number} */(cached.get(key));
  };
  /** @type {Array<{method:string,reason:string}>} */
  const failed=[];
  /** @param {number} candidate @param {'reanchor'|'cegar8'|'cegar128'} method
   * @returns {{value:number,queries:number,method:'reanchor'|'cegar8'|'cegar128',failed:Array<{method:string,reason:string}>}}
   */
  function accept(candidate,method) {
    if(!Number.isInteger(candidate)||candidate<0||candidate>0xffffffff) {
      throw new RangeError('Hybrid candidate must be an unsigned 32-bit integer');
    }
    if(query(candidate)!==target){
      throw new Error('Hybrid sub-inverter returned a non-preimage');
    }
    return {value:candidate,queries:cached.size,method,failed};
  }
  try {
    const candidate=invertByReanchoring(query,target,u32(seed^0x6a09e667),4);
    return accept(candidate.value,'reanchor');
  }catch(error) {
    if(!(error instanceof Error)||
       error.message!=='No successful reanchored inversion after 4 bases')throw error;
    failed.push({method:'reanchor',reason:error.message});
  }
  for(const validations of [8,128]){
    const label=validations===8?'cegar8':'cegar128';
    try {
      const candidate=invertLinearSandwich(query,target,u32(seed^0xbb67ae85),{
        defectSamples:32,validationTrials:validations
      });
      return accept(candidate.value,label);
    }catch(error) {
      // A CEGAR search that cannot certify a functional is a normal
      // model failure. Callback/transport failures and implementation
      // errors must remain visible to the caller.
      if(!(error instanceof Error)||
        !/^(?:no output functional at level \d+|no validated output functional at level \d+|CEGAR refinement limit at level \d+|sandwich inversion failed final equality)$/.test(error.message)) {
        throw error;
      }
      failed.push({method:label,reason:error.message});
    }
  }
  throw new AggregateError(failed.map(x=>new Error(x.reason)),
    'All three validated chosen-query inversion methods failed');
}

/**
 * @returns {{total:number,exact:number,poisoned:number,dense:number,
 *   selectedRare:number,queriesMin:number,queriesMax:number,counts:Record<string,number>,
 *   rows:Array<{family:string,sourceSeed:number,method:string,queries:number,
 *     failedCount:number}>}}
 */
function runEvidence(){
  /** @type {Array<{family:string,sourceSeed:number,method:string,queries:number,
   *   failedCount:number}>} */
  const rows=[];
  let poisoned=0,dense=0,selectedRare=0;
  for(let index=0;index<6;index++) {
    const seed=u32(0x2026a114^Math.imul(index+1,0x9e3779b9));
    const source=poisonCanonicalAnchor(seed);
    const attack=invertHybrid(source.oracle,source.oracle(source.secret),
      u32(0x10102c03+index));
    assert.equal(attack.value,source.secret);
    rows.push({family:'poisoned-four-shear',sourceSeed:source.sourceSeed,
      method:attack.method,queries:attack.queries,failedCount:attack.failed.length});
    poisoned++;selectedRare++;
  }
  /** @type {{name:string,make:(seed:number)=>(input:number)=>number}[]} */
  const families=[
    {name:'dense-triangular',make:seed=>makeTriangularCompatiblePermutation(seed)},
    {name:'rivest-3',make:seed=>makeRivestPermutation(3,seed)},
    {name:'rivest-7',make:seed=>makeRivestPermutation(7,seed)}
  ];
  for(const family of families) {
    for(let index=0;index<8;index++) {
      const seed=u32(0x7b4fa128^Math.imul(index+1,0x9e3779b9));
      const inner=makeLinearTransform(seed^0x6a09e667);
      const outer=makeLinearTransform(seed^0xbb67ae85);
      const p=family.make(seed^0x3c6ef372);
      const next=makeRng(seed^0xa54ff53a);
      const inOffset=next(),outOffset=next(),secret=next();
      /** @param {number} x @returns {number} */
      const oracle=x=>u32(applyLinear(outer,
        p(u32(applyLinear(inner,x)^inOffset)))^outOffset);
      const attack=invertHybrid(oracle,oracle(secret),u32(seed^0x516a1128));
      assert.equal(attack.value,secret);
      rows.push({family:family.name,sourceSeed:seed,
        method:attack.method,queries:attack.queries,failedCount:attack.failed.length});
      dense++;
    }
  }
  /** @type {Record<string,number>} */
  const counts={reanchor:0,cegar8:0,cegar128:0};
  for(const row of rows)counts[row.method]++;
  return {total:rows.length,exact:rows.length,poisoned,dense,selectedRare,
    queriesMin:Math.min(...rows.map(x=>x.queries)),
    queriesMax:Math.max(...rows.map(x=>x.queries)),counts,rows};
}
if(require.main===module)console.log('HYBRID_REANCHOR_CEGAR '+JSON.stringify(runEvidence()));
module.exports={invertHybrid,runEvidence};
