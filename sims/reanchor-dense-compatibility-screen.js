'use strict';

const {inverseOfColumns,makeFixture}=
  require('./sparse-triangular-fixedpoint-inversion');
const {
  invertByReanchoring
}=require('./random-affine-anchor-compatible-inversion');
const {
  makeRng,makeLinearTransform,applyLinear,
  makeTriangularCompatiblePermutation,makeRivestPermutation,u32
}=require('./compatible-permutation-linear-sandwich-blackbox');

/**
 * A source-private audit of the exact premise used by the generalized
 * compatible-B reanchoring proof. The attacker never sees this audit.
 * The observed oracle difference matrix is M=Lout D Lin;
 * normalizing by Lin and Lout gives B=D Lin^-1.
 *
 * @param {(x:number)=>number} permutation
 * @param {number[]} inner
 * @param {number} offset
 * @param {number} anchor
 * @returns {{fullRank:boolean,compatible:boolean}}
 */
function classifyBasis(permutation,inner,offset,anchor) {
  const inverse=inverseOfColumns(inner);
  if(inverse===null)throw Error('Fixture inner affine map is singular');
  const center=u32(applyLinear(inner,anchor)^offset);
  const base=permutation(center);
  const columns=inner.map(column=>
    u32(permutation(u32(center^column))^base));
  const fullRank=inverseOfColumns(columns)!==null;
  const Bcols=Array.from({length:32},(_,bit)=>
    applyLinear(columns,inverse(u32(2**bit))));
  const compatible=Bcols.every((column,bit)=>
    ((column>>>bit)&1)===1&&
    (column&u32((2**bit)-1))===0);
  if(compatible&&!fullRank)throw Error('Compatible matrix cannot be singular');
  return {fullRank,compatible};
}

/**
 * Repeat a genuinely public chosen-input inversion policy with up to 16
 * independent reproducible anchors on three dense two-sided affine
 * compatible permutation source families. The private audit classifies
 * every actual basis, keeping conditional theorem successes distinct
 * from opportunistic equality on incompatible bases.
 *
 * @returns {{families:Array<{name:string,cases:number,exact:number,
 *   failures:number,attemptedAnchors:number,compatibleAnchors:number,
 *   incompatibleFullRankAnchors:number,singularAnchors:number,
 *   fortuitousSuccesses:number,meanQueries:number,minQueries:number,
 *   maxQueries:number}>,sourceTotal:number,targetTotal:number,
 *   totalExact:number,totalFailures:number,positiveControlCompatible:boolean}}
 */
function runEvidence() {
  /** @type {Array<{name:string,make:(seed:number)=>(x:number)=>number}>} */
  const families=[
    {name:'nonlinear-triangular',make:seed=>
      makeTriangularCompatiblePermutation(seed)},
    {name:'rivest-degree-3',make:seed=>makeRivestPermutation(3,seed)},
    {name:'rivest-degree-7',make:seed=>makeRivestPermutation(7,seed)}
  ];
  /** @type {Array<{name:string,cases:number,exact:number,
   *   failures:number,attemptedAnchors:number,compatibleAnchors:number,
   *   incompatibleFullRankAnchors:number,singularAnchors:number,
   *   fortuitousSuccesses:number,meanQueries:number,minQueries:number,
   *   maxQueries:number}>} */
  const rows=[];
  let totalExact=0,totalFailures=0;
  for(const family of families) {
    let exact=0,failures=0,attemptedAnchors=0,compatibleAnchors=0;
    let incompatibleFullRankAnchors=0,singularAnchors=0,fortuitousSuccesses=0;
    /** @type {number[]} */
    const queries=[];
    for(let index=0;index<32;index++) {
      const seed=u32(0x7b4fa128^Math.imul(index+1,0x9e3779b9));
      const inner=makeLinearTransform(seed^0x6a09e667);
      const outer=makeLinearTransform(seed^0xbb67ae85);
      const permutation=family.make(seed^0x3c6ef372);
      const next=makeRng(seed^0xa54ff53a);
      const innerOffset=next(),outerOffset=next(),secret=next();
      /** @param {number} x @returns {number} */
      const oracle=x=>u32(applyLinear(outer,
        permutation(u32(applyLinear(inner,x)^innerOffset)))^outerOffset);
      const target=oracle(secret);
      const sample=makeRng(u32(0x10002211^seed));
      const anchors=[0];
      const seen=new Set();
      /** @type {ReturnType<typeof invertByReanchoring>|null} */
      let success=null;
      try {
        success=invertByReanchoring(input=>{
          seen.add(input>>>0);
          return oracle(input);
        },target,()=>{
          const anchor=sample();
          anchors.push(anchor);
          return anchor;
        },16,true);
        if(success.value!==secret)throw Error('Exact recovered preimage mismatch');
        exact++;
      }catch(error) {
        if(!(error instanceof Error)||
          error.message!=='No successful reanchored inversion after 16 bases')throw error;
        failures++;
      }
      queries.push(seen.size);
      let localCompatible=false;
      for(const anchor of anchors) {
        const classification=classifyBasis(permutation,inner,innerOffset,anchor);
        attemptedAnchors++;
        if(classification.compatible) {
          compatibleAnchors++;
          localCompatible=true;
        }else if(classification.fullRank)incompatibleFullRankAnchors++;
        else singularAnchors++;
      }
      if(localCompatible&&success===null) {
        throw Error('Compatible source-private basis was not inverted');
      }
      if(!localCompatible&&success!==null)fortuitousSuccesses++;
      if(success&&anchors.length!==success.basesTried) {
        throw Error('Sampled anchor transcript is inconsistent');
      }
    }
    totalExact+=exact;
    totalFailures+=failures;
    rows.push({name:family.name,cases:32,exact,failures,
      attemptedAnchors,compatibleAnchors,
      incompatibleFullRankAnchors,singularAnchors,
      fortuitousSuccesses,
      meanQueries:queries.reduce((sum,n)=>sum+n,0)/queries.length,
      minQueries:Math.min(...queries),maxQueries:Math.max(...queries)});
  }
  const fixture=makeFixture(0x2026a114);
  const positive=classifyBasis(
    fixture.permutation,fixture.inner,fixture.innerOffset,0);
  if(!positive.compatible||!positive.fullRank||
    !fixture.anchorsClean)throw Error('Independent clean-basis control failed');
  return {families:rows,sourceTotal:96,targetTotal:96,
    totalExact,totalFailures,positiveControlCompatible:true};
}

if(require.main===module)
  console.log('REANCHOR_DENSE_COMPATIBILITY '+JSON.stringify(runEvidence()));
module.exports={classifyBasis,runEvidence};
