'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {performance}=require('node:perf_hooks');
const {
  makeRng,makeLinearTransform,applyLinear,invertLinearSandwich,u32
}=require('../sims/compatible-permutation-linear-sandwich-blackbox');

const LOW_BITS=16;
const LOW_MASK=2**LOW_BITS-1;
const FLIP=2**25;

/**
 * A 32-bit compatible involution changes bit 25 only when the lower
 * sixteen bits have a fixed marker. Every higher output bit still
 * depends only on its own input bit and lower bits, so it is a bijection.
 *
 * Pick one target deliberately inside the low-density changed coset.
 * The matched control target is outside it on the identical permutation.
 * Both are surrounded by the same two full-rank hidden linear maps.
 *
 * @param {number} seed
 * @returns {{secret:number,control:number,marker:number,permutation:(x:number)=>number,
 *   transformedSecret:number,oracle:(x:number)=>number}}
 */
function makeRareCase(seed) {
  const inner=makeLinearTransform(seed^0x6a09e667);
  const outer=makeLinearTransform(seed^0xbb67ae85);
  const secret=makeRng(seed^0x3c6ef372)();
  const transformedSecret=applyLinear(inner,secret);
  const marker=transformedSecret&LOW_MASK;
  /** @param {number} value @returns {number} */
  const permutation=value=>u32(value^((value&LOW_MASK)===marker?FLIP:0));
  /** @param {number} value @returns {number} */
  const oracle=value=>applyLinear(outer,permutation(applyLinear(inner,value)));
  let control=-1;
  for(let bit=0;bit<32;bit++) {
    const candidate=u32(secret^(2**bit));
    if((applyLinear(inner,candidate)&LOW_MASK)!==marker) {
      control=candidate;
      break;
    }
  }
  assert.ok(control>=0,'invertible input map must move some low-bit coordinate');
  assert.equal(transformedSecret&LOW_MASK,marker);
  assert.notEqual(applyLinear(inner,control)&LOW_MASK,marker);
  assert.equal(permutation(permutation(transformedSecret)),transformedSecret);
  assert.equal(permutation(permutation(applyLinear(inner,control))),applyLinear(inner,control));
  assert.notEqual(oracle(secret),oracle(control));
  return {secret,control,marker,permutation,transformedSecret,oracle};
}

/**
 * Observe a single attempt without converting a deliberate adversarial
 * failure into a misleading CI failure. The original inverter independently
 * verifies final equality and throws on unsuccessful reconstruction.
 *
 * @param {(x:number)=>number} oracle
 * @param {number} secret
 * @param {number} seed
 * @param {number} validations
 * @returns {{status:string,queries:number,refinements:number|null,elapsedMs:number}}
 */
function attempt(oracle,secret,seed,validations) {
  const queries=new Set();
  /** @param {number} input @returns {number} */
  const counted=input=>{
    queries.add(input>>>0);
    return oracle(input);
  };
  const target=oracle(secret);
  const started=performance.now();
  let status='inversion-failed';
  /** @type {number|null} */
  let refinements=null;
  try{
    const recovered=invertLinearSandwich(counted,target,seed,{
      validationTrials:validations,defectSamples:32
    });
    status=recovered.value===secret?'exact':'wrong-preimage';
    refinements=recovered.refinements;
  }catch(error) {
    const message=error instanceof Error?error.message:String(error);
    status=message.includes('final equality')?'final-equality-failed':'other-error:'+message;
  }
  return {status,queries:queries.size,refinements,
    elapsedMs:Number((performance.now()-started).toFixed(3))};
}

test('rare-branch compatible permutations: selected target versus matched control',()=>{
  /** @type {Array<{seed:number,marker:number,validations:number,rare:ReturnType<typeof attempt>,
   *   control:ReturnType<typeof attempt>}>} */
  const observations=[];
  for(let index=0;index<6;index++){
    const seed=u32(0x5eed17a9^Math.imul(index+1,0x9e3779b9));
    const fixture=makeRareCase(seed);
    for(const validations of [8,128]){
      const attackSeed=seed^0x510e527f;
      const rare=attempt(fixture.oracle,fixture.secret,attackSeed,validations);
      const control=attempt(fixture.oracle,fixture.control,attackSeed,validations);
      observations.push({seed,marker:fixture.marker,validations,rare,control});
    }
  }
  assert.equal(observations.length,12);
  assert.ok(observations.every(row=>row.rare.queries>0&&row.control.queries>0));
  const byValidation=[8,128].map(validations=>{
    const rows=observations.filter(row=>row.validations===validations);
    return {validations,
      rareExact:rows.filter(row=>row.rare.status==='exact').length,
      controlExact:rows.filter(row=>row.control.status==='exact').length,
      rareStatuses:rows.map(row=>row.rare.status),
      controlStatuses:rows.map(row=>row.control.status),
      rareQueries:rows.map(row=>row.rare.queries),
      controlQueries:rows.map(row=>row.control.queries)};
  });
  console.log('RARE_COMPATIBLE_CEGAR '+JSON.stringify({
    family:'bit-25 involution gated on one 16-bit low suffix',
    selection:'target inside altered coset, matched control outside',
    seedScheme:'0x5eed17a9 XOR imul(index+1,0x9e3779b9)',
    observations,byValidation,
    interpretation:'empirical source-pinned attack stress; no universal inversion claim'
  }));
});
