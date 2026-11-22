'use strict';

const assert=require('node:assert/strict');
const {inverseOfColumns}=require('./sparse-triangular-fixedpoint-inversion');
const {poisonCanonicalAnchor,invertByReanchoring}=
  require('./random-affine-anchor-compatible-inversion');
const {
  makeRng,makeLinearTransform,applyLinear,makeTriangularCompatiblePermutation,
  makeRivestPermutation,u32
}=require('./compatible-permutation-linear-sandwich-blackbox');

/**
 * A private-source diagnostic (unavailable to a black-box attacker).
 * It computes B=Lout^-1 M_r Lin^-1 for a chosen anchor interpolation M_r
 * and tests invertible lower-unitriangular compatibility exactly.
 *
 * @param {(x:number)=>number} oracle
 * @param {number[]} inner
 * @param {number[]} outer
 * @param {number} anchor
 * @returns {{rankFull:boolean,compatible:boolean,
 *   firstIncompatibleColumn:number,columns:number[]}}
 */
function inspectHiddenInterpolant(oracle,inner,outer,anchor){
  const invertInner=inverseOfColumns(inner);
  const invertOuter=inverseOfColumns(outer);
  assert.ok(invertInner&&invertOuter,'Hidden wrappers must be full rank');
  const center=oracle(anchor);
  const observed=Array.from({length:32},(_,i)=>
    u32(oracle(u32(anchor^(2**i)))^center));
  if(inverseOfColumns(observed)===null){
    return {rankFull:false,compatible:false,
      firstIncompatibleColumn:-1,columns:[]};
  }
  const columns=Array.from({length:32},(_,i)=>{
    const sourceInput=invertInner(u32(2**i));
    return invertOuter(applyLinear(observed,sourceInput));
  });
  let firstIncompatibleColumn=-1;
  for(let i=0;i<32;i++){
    const lowerMask=2**i-1;
    const diagonalBit=2**i;
    if((columns[i]&lowerMask)!==0||(columns[i]&diagonalBit)===0){
      firstIncompatibleColumn=i;
      break;
    }
  }
  return {rankFull:true,compatible:firstIncompatibleColumn<0,
    firstIncompatibleColumn,columns};
}

/**
 * Source-selected sparse bases versus dense controls. Every source-known
 * compatible basis is independently passed to the same attacker with a
 * single anchored attempt. Source-unknown bases are classified by the
 * hidden wrapper matrices, never by attacker success.
 *
 * @returns {{sparseSources:number,denseSources:number,audits:number,
 *   compatible:number,rankDeficient:number,incompatible:number,
 *   admissibleExact:number,admissibleFailures:number,
 *   incidentalOutsideAdmissibility:number,
 *   rows:Array<{family:string,sourceSeed:number,anchor:number,
 *     rankFull:boolean,compatible:boolean,status:string,queries:number}>}}
 */
function runEvidence(){
  /** @type {Array<{family:string,sourceSeed:number,anchor:number,
   * rankFull:boolean,compatible:boolean,status:string,queries:number}>} */
  const rows=[];
  let compatible=0,rankDeficient=0,incompatible=0;
  let admissibleExact=0,admissibleFailures=0;
  let incidentalOutsideAdmissibility=0;
  /** @param {string} family @param {number} sourceSeed @param {(x:number)=>number} oracle
   * @param {number[]} inner @param {number[]} outer @param {number} anchor
   * @param {number} secret @returns {void}
   */
  function audit(family,sourceSeed,oracle,inner,outer,anchor,secret){
    const proof=inspectHiddenInterpolant(oracle,inner,outer,anchor);
    if(!proof.rankFull)rankDeficient++;
    else if(!proof.compatible)incompatible++;
    else compatible++;
    /** @type {string} */
    let status='no-target-equality';
    /** @type {number} */
    let queries=0;
    const asked=new Set();
    try{
      const recovered=invertByReanchoring(x=>{
        asked.add(x>>>0);
        return oracle(x);
      },oracle(secret),()=>anchor,1,false);
      assert.equal(recovered.value,secret,'Verified result is not the source preimage');
      status='exact';
    }catch(error){
      if(!(error instanceof Error)||
         error.message!=='No successful reanchored inversion after 1 bases')throw error;
    }
    queries=asked.size;
    if(proof.compatible){
      if(status==='exact')admissibleExact++;
      else admissibleFailures++;
    }else if(status==='exact')incidentalOutsideAdmissibility++;
    rows.push({family,sourceSeed,anchor,rankFull:proof.rankFull,
      compatible:proof.compatible,status,queries});
  }
  for(let index=0;index<6;index++){
    const sourceSeed=u32(0x2026a114^Math.imul(index+1,0x9e3779b9));
    const fixture=poisonCanonicalAnchor(sourceSeed);
    const inner=makeLinearTransform(fixture.sourceSeed^0x6a09e667);
    const outer=makeLinearTransform(fixture.sourceSeed^0xbb67ae85);
    const draw=makeRng(u32(0x41720c29+index*0x9e3779b9));
    audit('poisoned-four-shear',fixture.sourceSeed,fixture.oracle,
      inner,outer,0,fixture.secret);
    audit('poisoned-four-shear',fixture.sourceSeed,fixture.oracle,
      inner,outer,draw(),fixture.secret);
  }
  /** @type {{name:string,make:(seed:number)=>(x:number)=>number}[]} */
  const families=[
    {name:'dense-triangular',make:seed=>makeTriangularCompatiblePermutation(seed)},
    {name:'rivest-3',make:seed=>makeRivestPermutation(3,seed)},
    {name:'rivest-7',make:seed=>makeRivestPermutation(7,seed)}
  ];
  for(const family of families)for(let index=0;index<8;index++){
    const sourceSeed=u32(0x7b4fa128^Math.imul(index+1,0x9e3779b9));
    const inner=makeLinearTransform(sourceSeed^0x6a09e667);
    const outer=makeLinearTransform(sourceSeed^0xbb67ae85);
    const permutation=family.make(sourceSeed^0x3c6ef372);
    const random=makeRng(sourceSeed^0xa54ff53a);
    const inputOffset=random(),outputOffset=random(),secret=random();
    /** @param {number} x @returns {number} */
    const oracle=x=>u32(applyLinear(outer,permutation(
      u32(applyLinear(inner,x)^inputOffset)))^outputOffset);
    const draw=makeRng(u32(sourceSeed^0x516a1128));
    audit(family.name,sourceSeed,oracle,inner,outer,0,secret);
    for(let i=0;i<3;i++)audit(family.name,sourceSeed,oracle,
      inner,outer,draw(),secret);
  }
  assert.equal(admissibleFailures,0,
    'Source-proven compatible interpolants must always invert exactly');
  return {sparseSources:6,denseSources:24,audits:rows.length,
    compatible,rankDeficient,incompatible,
    admissibleExact,admissibleFailures,incidentalOutsideAdmissibility,rows};
}
if(require.main===module)console.log('HIDDEN_COMPATIBLE_AUDIT '+JSON.stringify(runEvidence()));
module.exports={inspectHiddenInterpolant,runEvidence};
