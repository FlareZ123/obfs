'use strict';

const assert=require('node:assert/strict');
const {
  makeRng,makeLinearTransform,applyLinear,invertLinearSandwich,u32
}=require('./compatible-permutation-linear-sandwich-blackbox');
const {invertRankOneShear}=
  require('./compatible-rank-one-shear-two-sided-inversion');

/**
 * Recover the inverse of one full-rank 32x32 binary map represented by
 * its output columns. This solver is deliberately independent from the
 * oracle and the private source-construction parameters.
 *
 * @param {number[]} columns
 * @returns {((rhs:number)=>number)|null}
 */
function inverseOfColumns(columns) {
  if(columns.length!==32)throw new RangeError('Need 32 output columns');
  const pivots=Array(32).fill(0);
  const preimages=Array(32).fill(0);
  for(let index=0;index<32;index++) {
    let image=columns[index]>>>0;
    let preimage=u32(2**index);
    for(let bit=31;bit>=0&&image!==0;bit--) {
      if(((image>>>bit)&1)===0)continue;
      if(pivots[bit]!==0) {
        image=u32(image^pivots[bit]);
        preimage=u32(preimage^preimages[bit]);
      } else {
        pivots[bit]=image;
        preimages[bit]=preimage;
        break;
      }
    }
    if(image===0)return null;
  }
  /** @param {number} rhs @returns {number} */
  return rhs=>{
    let image=rhs>>>0;
    let preimage=0;
    for(let bit=31;bit>=0&&image!==0;bit--) {
      if(((image>>>bit)&1)===0)continue;
      if(pivots[bit]===0)throw new Error('Missing invertible-map pivot');
      image=u32(image^pivots[bit]);
      preimage=u32(preimage^preimages[bit]);
    }
    if(image!==0)throw new Error('Full-rank linear solve did not finish');
    return preimage>>>0;
  };
}

/**
 * A source-independent chosen-oracle attack for F(x)=c XOR
 * Lout(P(Lin(x) XOR b)), where P is a triangular compatible permutation.
 *
 * CONDITIONAL preflight: the 33 oracle anchors must expose the true linear
 * composite A=Lout∘Lin, meaning their nonlinear shifts are equal. When this
 * happens, the iteration corrects one more input bit per query in Lin's
 * hidden coordinates. This procedure does not claim to detect bad anchors.
 *
 * @param {(x:number)=>number} oracle
 * @param {number} target
 * @returns {{value:number,queries:number,corrections:number}}
 */
function invertFromCleanAffineAnchors(oracle,target) {
  /** @type {Map<number,number>} */
  const seen=new Map();
  /** @param {number} input @returns {number} */
  function query(input) {
    const key=input>>>0;
    const existing=seen.get(key);
    if(existing!==undefined)return existing;
    const observed=oracle(key)>>>0;
    seen.set(key,observed);
    return observed;
  }
  const base=query(0);
  const columns=Array.from({length:32},(_,bit)=>
    u32(query(u32(2**bit))^base));
  const solve=inverseOfColumns(columns);
  if(solve===null)throw new Error('Anchor interpolation is rank deficient');
  let candidate=solve(u32(target^base));
  for(let correction=0;correction<=32;correction++) {
    const observed=query(candidate);
    if(observed===(target>>>0)) {
      return {value:candidate,queries:seen.size,corrections:correction};
    }
    if(correction===32)break;
    candidate=u32(candidate^solve(u32(observed^target)));
  }
  throw new Error('Triangular fixed point failed to converge within 32 corrections');
}

/**
 * Four increasing, interacting, sparse involutive shears. The selection
 * markers are chosen from the secret's intermediate transformed state,
 * deliberately forcing ALL four branches at the target. Because gate j
 * reads only coordinates below j, the composite is a compatible
 * permutation, including with the previous gates' mutations.
 *
 * @param {number} seed
 * @returns {{
 *   seed:number,sourceSeed:number,secret:number,control:number,
 *   oracle:(x:number)=>number,permutation:(z:number)=>number,
 *   inner:number[],innerOffset:number,outputOffset:number,
 *   gates:Array<{bit:number,mask:number,marker:number,flip:number}>,
 *   selectedZ:number,anchorsClean:boolean
 * }}
 */
function makeFixture(seed) {
  const bits=[17,21,25,29];
  for(let rejection=0;rejection<128;rejection++) {
    const sourceSeed=u32(seed+rejection);
    const inner=makeLinearTransform(sourceSeed^0x6a09e667);
    const outer=makeLinearTransform(sourceSeed^0xbb67ae85);
    const next=makeRng(sourceSeed^0x3c6ef372);
    const innerOffset=next(),outputOffset=next(),secret=next();
    const selectedZ=u32(applyLinear(inner,secret)^innerOffset);
    let selectedStage=selectedZ;
    /** @type {Array<{bit:number,mask:number,marker:number,flip:number}>} */
    const gates=[];
    for(const bit of bits) {
      const mask=2**bit-1;
      const marker=selectedStage&mask;
      const flip=u32(2**bit);
      gates.push({bit,mask,marker,flip});
      selectedStage=u32(selectedStage^flip);
    }
    /** @param {number} input @returns {number} */
    const permutation=input=>{
      let z=input>>>0;
      for(const gate of gates) {
        if((z&gate.mask)===gate.marker)z=u32(z^gate.flip);
      }
      return z;
    };
    /** @param {number} input @returns {number} */
    const oracle=input=>u32(applyLinear(outer,
      permutation(u32(applyLinear(inner,input)^innerOffset)))^outputOffset);
    // The attack does NOT inspect this flag. The source generator checks
    // the affine-anchor contract independently before admitting a fixture.
    const anchorsClean=Array.from({length:33},(_,i)=>i===0?0:u32(2**(i-1)))
      .every(input=>{
        const z=u32(applyLinear(inner,input)^innerOffset);
        return permutation(z)===z;
      });
    if(!anchorsClean)continue;
    let control=-1;
    for(let bit=0;bit<32;bit++) {
      const candidate=u32(secret^(2**bit));
      const controlZ=u32(applyLinear(inner,candidate)^innerOffset);
      if((controlZ&gates[0].mask)!==(selectedZ&gates[0].mask)) {
        control=candidate;
        break;
      }
    }
    if(control<0)throw new Error('Full-rank Lin cannot change low gate bits');
    return {seed,sourceSeed,secret,control,oracle,permutation,inner,
      innerOffset,outputOffset,gates,selectedZ,anchorsClean};
  }
  throw new Error('Unable to find clean deterministic affine anchors');
}

/**
 * A secondary defender-known audit that proves actual interaction,
 * not merely four gates that happen to equal the identity everywhere.
 *
 * @param {ReturnType<typeof makeFixture>} fixture
 * @returns {void}
 */
function auditFixture(fixture) {
  const {gates,permutation,selectedZ,inner,innerOffset,secret,control}=fixture;
  const chosenDeltas=[
    {input:u32(selectedZ^(2**15)),expected:0},
    {input:u32(selectedZ^(2**19)),expected:gates[0].flip},
    {input:u32(selectedZ^(2**23)),expected:u32(gates[0].flip^gates[1].flip)},
    {input:u32(selectedZ^(2**27)),expected:u32(gates[0].flip^gates[1].flip^gates[2].flip)},
    {input:selectedZ,expected:u32(gates[0].flip^gates[1].flip^gates[2].flip^gates[3].flip)}
  ];
  for(const {input,expected} of chosenDeltas) {
    assert.equal(u32(permutation(input)^input),expected,'Shear support witness');
  }
  /** @param {number} source @returns {number} */
  function inversePermutation(source) {
    let z=source>>>0;
    for(let i=gates.length-1;i>=0;i--) {
      const gate=gates[i];
      if((z&gate.mask)===gate.marker)z=u32(z^gate.flip);
    }
    return z;
  }
  const next=makeRng(fixture.sourceSeed^0x510e527f);
  for(let count=0;count<512;count++) {
    const input=count<5?chosenDeltas[count].input:next();
    assert.equal(inversePermutation(permutation(input)),input,
      'Composite invertibility at sampled input');
  }
  assert.equal(u32(applyLinear(inner,secret)^innerOffset),selectedZ);
  assert.notEqual(fixture.oracle(secret),fixture.oracle(control));
  assert.equal(permutation(u32(applyLinear(inner,control)^innerOffset)),
    u32(applyLinear(inner,control)^innerOffset));
}

/**
 * @param {(input:number)=>number} oracle
 * @param {number} secret
 * @param {number} seed
 * @param {number} validations
 * @returns {{status:string,queries:number}}
 */
function observeCegar(oracle,secret,seed,validations) {
  const asked=new Set();
  /** @param {number} x @returns {number} */
  const counted=x=>{
    asked.add(x>>>0);
    return oracle(x);
  };
  let status='failed';
  try {
    const result=invertLinearSandwich(counted,oracle(secret),seed,{
      defectSamples:32,validationTrials:validations
    });
    status=result.value===secret?'exact':'wrong-value';
  }catch(error) {
    const message=error instanceof Error?error.message:String(error);
    status=message.includes('final equality')?'final-equality-failed':
      'other-error:'+message;
  }
  return {status,queries:asked.size};
}

/**
 * @param {(input:number)=>number} oracle
 * @param {number} secret
 * @returns {{status:string,queries:number}}
 */
function observeRankOne(oracle,secret) {
  try {
    const result=invertRankOneShear(oracle,oracle(secret));
    return {status:result.value===secret?'exact':'wrong-value',
      queries:result.queryCount};
  }catch(error) {
    const message=error instanceof Error?error.message:String(error);
    return {status:'other-error:'+message,queries:0};
  }
}

/**
 * @returns {{
 *   sources:number,rareExact:number,controlExact:number,heldouts:number,
 *   rows:Array<{seed:number,sourceSeed:number,rareQueries:number,rareCorrections:number,
 *     controlQueries:number,controlCorrections:number,rankOneRare:ReturnType<typeof observeRankOne>,
 *     rankOneControl:ReturnType<typeof observeRankOne>,cegar:Array<{validations:number,
 *     rare:ReturnType<typeof observeCegar>,control:ReturnType<typeof observeCegar>}>}>
 * }}
 */
function runEvidence() {
  /** @type {Array<{
   *   seed:number,sourceSeed:number,rareQueries:number,rareCorrections:number,
   *   controlQueries:number,controlCorrections:number,
   *   rankOneRare:ReturnType<typeof observeRankOne>,
   *   rankOneControl:ReturnType<typeof observeRankOne>,
   *   cegar:Array<{validations:number,rare:ReturnType<typeof observeCegar>,
   *     control:ReturnType<typeof observeCegar>}>
   * }>} */
  const rows=[];
  let rareExact=0,controlExact=0,heldouts=0;
  for(let index=0;index<6;index++) {
    const seed=u32(0x42bea19c^Math.imul(index+1,0x9e3779b9));
    const fixture=makeFixture(seed);
    auditFixture(fixture);
    const rare=invertFromCleanAffineAnchors(fixture.oracle,fixture.oracle(fixture.secret));
    const control=invertFromCleanAffineAnchors(fixture.oracle,fixture.oracle(fixture.control));
    assert.ok(rare.queries<=66 && control.queries<=66);
    assert.equal(rare.value,fixture.secret,'Forced four-shear secret');
    assert.equal(control.value,fixture.control,'Same-oracle ordinary control');
    rareExact++;
    controlExact++;
    const rankOneRare=observeRankOne(fixture.oracle,fixture.secret);
    const rankOneControl=observeRankOne(fixture.oracle,fixture.control);
    const cegar=[8,128].map(validations=>({
      validations,
      rare:observeCegar(fixture.oracle,fixture.secret,seed^0x243f6a88,validations),
      control:observeCegar(fixture.oracle,fixture.control,seed^0x243f6a88,validations)
    }));
    const random=makeRng(seed^0xa54ff53a);
    for(let sample=0;sample<128;sample++) {
      const secret=random();
      const result=invertFromCleanAffineAnchors(fixture.oracle,fixture.oracle(secret));
      assert.equal(result.value,secret,'Held-out chosen target');
      assert.ok(result.queries<=66);
      heldouts++;
    }
    rows.push({seed,sourceSeed:fixture.sourceSeed,
      rareQueries:rare.queries,rareCorrections:rare.corrections,
      controlQueries:control.queries,controlCorrections:control.corrections,
      rankOneRare,rankOneControl,cegar});
  }
  assert.equal(rareExact,6);
  assert.equal(controlExact,6);
  assert.equal(heldouts,768);
  return {sources:rows.length,rareExact,controlExact,heldouts,rows};
}
if(require.main===module)console.log('SPARSE_TRIANGULAR_FIXEDPOINT '+JSON.stringify(runEvidence()));
module.exports={inverseOfColumns,invertFromCleanAffineAnchors,makeFixture,auditFixture,runEvidence};
