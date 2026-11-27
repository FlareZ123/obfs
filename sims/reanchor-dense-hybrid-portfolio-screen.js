'use strict';

const {invertHybrid}=require('./hybrid-reanchor-cegar-attack');
const {makeRng,makeLinearTransform,applyLinear,
  makeTriangularCompatiblePermutation,makeRivestPermutation,u32
}=require('./compatible-permutation-linear-sandwich-blackbox');

/**
 * Evaluate the EXISTING mixed-model public attack against exactly the
 * same 96 frozen dense source seeds/targets as the independent 16-basis
 * reanchoring-only screen. A failed attack remains a measured failure.
 * No source secrets or fixture classifier are given to invertHybrid.
 *
 * @returns {{families:Array<{name:string,cases:number,exact:number,
 *   failures:number,counts:Record<string,number>,minQueries:number,
 *   maxQueries:number,meanQueries:number}>,
 *   total:number,exact:number,failed:number,counts:Record<string,number>,
 *   errorRecords:Array<{name:string,index:number,message:string}>}}
 */
function runEvidence() {
  /** @type {Array<{name:string,make:(seed:number)=>(x:number)=>number}>} */
  const families=[
    {name:'nonlinear-triangular',make:seed=>
      makeTriangularCompatiblePermutation(seed)},
    {name:'rivest-degree-3',make:seed=>makeRivestPermutation(3,seed)},
    {name:'rivest-degree-7',make:seed=>makeRivestPermutation(7,seed)}
  ];
  /** @type {Array<{name:string,cases:number,exact:number,failures:number,
   * counts:Record<string,number>,minQueries:number,maxQueries:number,
   * meanQueries:number}>} */
  const rows=[];
  /** @type {Array<{name:string,index:number,message:string}>} */
  const errorRecords=[];
  /** @type {Record<string,number>} */
  const totals={reanchor:0,cegar8:0,cegar128:0};
  let totalExact=0,failed=0;
  for(const family of families) {
    let exact=0,failures=0;
    /** @type {Record<string,number>} */
    const counts={reanchor:0,cegar8:0,cegar128:0};
    /** @type {number[]} */
    const queries=[];
    for(let index=0;index<32;index++) {
      const seed=u32(0x7b4fa128^Math.imul(index+1,0x9e3779b9));
      const inner=makeLinearTransform(seed^0x6a09e667);
      const outer=makeLinearTransform(seed^0xbb67ae85);
      const p=family.make(seed^0x3c6ef372);
      const next=makeRng(seed^0xa54ff53a);
      const innerOffset=next(),outerOffset=next(),secret=next();
      /** @param {number} x @returns {number} */
      const oracle=x=>u32(applyLinear(outer,
        p(u32(applyLinear(inner,x)^innerOffset)))^outerOffset);
      const target=oracle(secret);
      const seen=new Set();
      try {
        const result=invertHybrid(x=>{
          seen.add(x>>>0);
          return oracle(x);
        },target,u32(seed^0x516a1128));
        if(result.value!==secret)
          throw Error('Inverter returned a nonsecret preimage of permutation');
        if(result.queries!==seen.size)
          throw Error('Hybrid query count disagrees with actual chosen calls');
        exact++;
        counts[result.method]++;
        totals[result.method]++;
      }catch(error) {
        if(!(error instanceof AggregateError)||
          error.message!=='All three validated chosen-query inversion methods failed'){
          throw error;
        }
        failures++;
        errorRecords.push({name:family.name,index,message:error.message});
      }
      queries.push(seen.size);
    }
    totalExact+=exact;
    failed+=failures;
    rows.push({name:family.name,cases:32,exact,failures,counts,
      minQueries:Math.min(...queries),maxQueries:Math.max(...queries),
      meanQueries:queries.reduce((sum,value)=>sum+value,0)/32});
  }
  return {families:rows,total:96,exact:totalExact,failed,
    counts:totals,errorRecords};
}
if(require.main===module)
  console.log('REANCHOR_DENSE_HYBRID '+JSON.stringify(runEvidence()));
module.exports={runEvidence};
