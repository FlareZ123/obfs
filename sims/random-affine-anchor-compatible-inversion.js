'use strict';

const assert=require('node:assert/strict');
const {
  inverseOfColumns,makeFixture
}=require('./sparse-triangular-fixedpoint-inversion');
const {
  makeRng,makeLinearTransform,applyLinear,
  makeTriangularCompatiblePermutation,makeRivestPermutation,u32
}=require('./compatible-permutation-linear-sandwich-blackbox');

/**
 * Query-only exact inversion attempt for two-sided wrapped compatible
 * permutations. Instead of assuming the canonical 0/basis probes are
 * clean, try a succession of public, independently seeded affine bases.
 * Each trial verifies the final target rather than claiming its learned
 * matrix is necessarily the true composite A.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} target
 * @param {number} randomSeed seed solely for attacker anchor selection
 * @param {number} [maxBases]
 * @returns {{value:number,queries:number,basesTried:number,
 *   corrections:number,anchor:number,
 *   failedBases:Array<{anchor:number,reason:string,queries:number}>}}
 */
function invertByReanchoring(oracle,target,randomSeed,maxBases=4) {
  if(!Number.isSafeInteger(maxBases)||maxBases<1||maxBases>16) {
    throw new RangeError('maxBases must be 1..16');
  }
  const draw=makeRng(randomSeed);
  /** @type {Map<number,number>} */
  const seen=new Map();
  /** @param {number} input @returns {number} */
  const query=input=>{
    const key=input>>>0;
    const previous=seen.get(key);
    if(previous!==undefined)return previous;
    const value=oracle(key)>>>0;
    seen.set(key,value);
    return value;
  };
  /** @type {Array<{anchor:number,reason:string,queries:number}>} */
  const failedBases=[];
  for(let basis=0;basis<maxBases;basis++) {
    const anchor=basis===0?0:draw();
    const base=query(anchor);
    const columns=Array.from({length:32},(_,bit)=>
      u32(query(u32(anchor^(2**bit)))^base));
    const solve=inverseOfColumns(columns);
    if(solve===null) {
      failedBases.push({anchor,reason:'interpolant-rank-deficient',queries:seen.size});
      continue;
    }
    let candidate=u32(anchor^solve(u32(target^base)));
    for(let correction=0;correction<=32;correction++) {
      const observed=query(candidate);
      if(observed===(target>>>0)) {
        return {value:candidate,queries:seen.size,
          basesTried:basis+1,corrections:correction,anchor,failedBases};
      }
      if(correction===32)break;
      candidate=u32(candidate^solve(u32(target^observed)));
    }
    failedBases.push({anchor,reason:'no-target-equality',queries:seen.size});
  }
  throw new Error('No successful reanchored inversion after '+maxBases+' bases');
}

/**
 * Source-known generation adds an exceptional bit-31 compatible toggle
 * precisely at the canonical x=0 oracle anchor. The original four
 * interacting shears and forced rare target remain unchanged.
 *
 * @param {number} seed
 * @returns {{seed:number,sourceSeed:number,secret:number,control:number,
 *   oracle:(x:number)=>number,
 *   canonicalMismatches:number,poisonMarker:number,
 *   canonicalRankFull:boolean,poisonInputDirection:number,
 *   poisonInputOddParity:boolean,cleanAt:(anchor:number)=>boolean}}
 */
function poisonCanonicalAnchor(seed) {
  for(let rejection=0;rejection<128;rejection++) {
    const fixture=makeFixture(u32(seed+rejection));
    const outer=makeLinearTransform(fixture.sourceSeed^0xbb67ae85);
    const marker=fixture.permutation(fixture.innerOffset)&0x7fffffff;
    /** @param {number} z @returns {number} */
    const poisonPermutation=z=>{
      const stage=fixture.permutation(z);
      return (stage&0x7fffffff)===marker?u32(stage^0x80000000):stage;
    };
    /** @param {number} x @returns {number} */
    const oracle=x=>u32(applyLinear(outer,
      poisonPermutation(u32(applyLinear(fixture.inner,x)^fixture.innerOffset)))^
      fixture.outputOffset);
    /**
     * Source-private proof oracle, unavailable to the chosen-query inverter.
     * A basis at r is clean iff each P-difference equals the input linear
     * column; cancellations at a dirty basis are admitted when true.
     * @param {number} anchor
     * @returns {boolean}
     */
    function cleanAt(anchor) {
      const center=u32(applyLinear(fixture.inner,anchor)^fixture.innerOffset);
      const baseline=poisonPermutation(center);
      for(let bit=0;bit<32;bit++) {
        const column=fixture.inner[bit];
        if(u32(poisonPermutation(u32(center^column))^baseline)!==column)return false;
      }
      return true;
    }
    // Selection excludes a basis collision or a changed target, solely
    // using the private source model. Inversion never sees these checks.
    if(oracle(fixture.secret)!==fixture.oracle(fixture.secret))continue;
    let basisCollision=false;
    for(let bit=0;bit<32;bit++) {
      const input=u32(2**bit);
      if(oracle(input)!==fixture.oracle(input)) {
        basisCollision=true;
        break;
      }
    }
    if(basisCollision)continue;
    assert.notEqual(oracle(0),fixture.oracle(0),'Canonical base must be poisoned');
    const Acolumns=Array.from({length:32},(_,bit)=>
      applyLinear(outer,fixture.inner[bit]));
    let mismatches=0;
    for(let bit=0;bit<32;bit++) {
      const actual=u32(oracle(u32(2**bit))^oracle(0));
      if(actual!==Acolumns[bit])mismatches++;
    }
    assert.equal(mismatches,32,'Every base-zero difference must be contaminated');
    assert.equal(cleanAt(0),false,'Poisoned canonical anchor must fail source proof');
    // Only the original base zero was changed. Every observed matrix
    // column is therefore A_i XOR Lout(e31), a rank-one update
    // M = A(I + Lin^-1(e31) * allOnes^T). This is singular precisely
    // when Lin^-1(e31) has odd Hamming parity over GF(2).
    const inputSolve=inverseOfColumns(fixture.inner);
    assert.ok(inputSolve);
    const poisonInputDirection=inputSolve(0x80000000);
    let parity=poisonInputDirection;
    parity^=parity>>>16;
    parity^=parity>>>8;
    parity^=parity>>>4;
    parity^=parity>>>2;
    parity^=parity>>>1;
    const poisonInputOddParity=(parity&1)!==0;
    const observedColumns=Array.from({length:32},(_,i)=>
      u32(oracle(u32(2**i))^oracle(0)));
    const canonicalRankFull=inverseOfColumns(observedColumns)!==null;
    assert.equal(canonicalRankFull,!poisonInputOddParity,
      'Rank-one GF(2) determinant condition must match observed rank');
    return {seed,sourceSeed:fixture.sourceSeed,secret:fixture.secret,
      control:fixture.control,oracle,canonicalMismatches:mismatches,
      poisonMarker:marker,cleanAt,canonicalRankFull,
      poisonInputDirection,poisonInputOddParity};
  }
  throw new Error('Unable to poison only the canonical affine anchor');
}

/** @param {(x:number)=>number} oracle @param {number} target
 * @returns {{status:string,queries:number}}
 */
function directCanonicalAttempt(oracle,target) {
  const asked=new Set();
  /** @param {number} x @returns {number} */
  const counted=x=>{
    asked.add(x>>>0);
    return oracle(x);
  };
  try {
    const recovered=invertByReanchoring(counted,target,0,1);
    return {status:'exact',queries:recovered.queries};
  }catch(error) {
    const message=error instanceof Error?error.message:String(error);
    return {status:message.includes('No successful')?'no-target-equality':
      'other-error:'+message,queries:asked.size};
  }
}

/**
 * Dense compatible permutations are a matched limitation control:
 * neither reanchoring nor fixed-point convergence has a proof without
 * an actual clean affine basis. Record successes and failure costs
 * without asserting that any particular family must fail.
 *
 * @returns {Array<{family:string,sources:number,exact:number,
 *   failures:number,queries:number[]}>}
 */
function denseControls() {
  const families=[
    {name:'nonlinear-triangular',make:(/** @type {number} */ seed)=>
      makeTriangularCompatiblePermutation(seed)},
    {name:'rivest-degree-3',make:(/** @type {number} */ seed)=>
      makeRivestPermutation(3,seed)},
    {name:'rivest-degree-7',make:(/** @type {number} */ seed)=>
      makeRivestPermutation(7,seed)}
  ];
  const rows=[];
  for(const family of families) {
    let exact=0,failures=0;
    const queries=[];
    for(let index=0;index<8;index++) {
      const sourceSeed=u32(0x7b4fa128^Math.imul(index+1,0x9e3779b9));
      const inner=makeLinearTransform(sourceSeed^0x6a09e667);
      const outer=makeLinearTransform(sourceSeed^0xbb67ae85);
      const permutation=family.make(sourceSeed^0x3c6ef372);
      const random=makeRng(sourceSeed^0xa54ff53a);
      const innerOffset=random(),outerOffset=random(),secret=random();
      /** @param {number} x @returns {number} */
      const oracle=x=>u32(applyLinear(outer,
        permutation(u32(applyLinear(inner,x)^innerOffset)))^outerOffset);
      const counted=new Set();
      try {
        const result=invertByReanchoring(x=>{
          counted.add(x>>>0);
          return oracle(x);
        },oracle(secret),u32(0x10002211+index),4);
        if(result.value!==secret)throw new Error('Nonunique recovered value');
        exact++;
      }catch(error) {
        if(!(error instanceof Error)||
           error.message!=='No successful reanchored inversion after 4 bases')throw error;
        failures++;
      }
      queries.push(counted.size);
    }
    rows.push({family:family.name,sources:8,exact,failures,queries});
  }
  return rows;
}

/**
 * @returns {{rareRecovered:number,controlRecovered:number,heldouts:number,
 *   poisonedSources:number,
 *   rows:Array<{seed:number,sourceSeed:number,canonicalMismatches:number,
 *   canonicalRankFull:boolean,poisonInputOddParity:boolean,
 *   rareAnchorClean:boolean,controlAnchorClean:boolean,
 *   directRare:ReturnType<typeof directCanonicalAttempt>,
 *   directControl:ReturnType<typeof directCanonicalAttempt>,
 *   rare:{queries:number,basesTried:number,corrections:number},
 *   control:{queries:number,basesTried:number,corrections:number}}>,
 *   dense:Array<{family:string,sources:number,exact:number,failures:number,
 *     queries:number[]}>}}
 */
function runEvidence() {
  /** @type {Array<{seed:number,sourceSeed:number,canonicalMismatches:number,
   *   canonicalRankFull:boolean,poisonInputOddParity:boolean,
   *   rareAnchorClean:boolean,controlAnchorClean:boolean,
   *   directRare:ReturnType<typeof directCanonicalAttempt>,
   *   directControl:ReturnType<typeof directCanonicalAttempt>,
   *   rare:{queries:number,basesTried:number,corrections:number},
   *   control:{queries:number,basesTried:number,corrections:number}}>} */
  const rows=[];
  let rareRecovered=0,controlRecovered=0,heldouts=0;
  for(let index=0;index<6;index++) {
    const seed=u32(0x2026a114^Math.imul(index+1,0x9e3779b9));
    const fixture=poisonCanonicalAnchor(seed);
    const attackSeed=u32(0x41720c29+index*0x9e3779b9);
    const rareTarget=fixture.oracle(fixture.secret);
    const controlTarget=fixture.oracle(fixture.control);
    const directRare=directCanonicalAttempt(fixture.oracle,rareTarget);
    const directControl=directCanonicalAttempt(fixture.oracle,controlTarget);
    const rare=invertByReanchoring(fixture.oracle,rareTarget,attackSeed,4);
    const control=invertByReanchoring(fixture.oracle,controlTarget,attackSeed,4);
    assert.equal(rare.value,fixture.secret,'Targeted rare source');
    assert.equal(control.value,fixture.control,'Ordinary source');
    assert.ok(rare.queries<=4*66&&control.queries<=4*66);
    assert.equal(fixture.canonicalRankFull,!fixture.poisonInputOddParity);
    assert.equal(directRare.status==='no-target-equality',!fixture.canonicalRankFull);
    rareRecovered++;
    controlRecovered++;
    const random=makeRng(u32(0x84f2b5a3+index));
    for(let j=0;j<64;j++) {
      const secret=random();
      const recovered=invertByReanchoring(fixture.oracle,
        fixture.oracle(secret),u32(attackSeed^j),4);
      assert.equal(recovered.value,secret,'Held-out target under poisoned anchor');
      heldouts++;
    }
    rows.push({seed,sourceSeed:fixture.sourceSeed,
      canonicalMismatches:fixture.canonicalMismatches,
      canonicalRankFull:fixture.canonicalRankFull,
      poisonInputOddParity:fixture.poisonInputOddParity,
      rareAnchorClean:fixture.cleanAt(rare.anchor),
      controlAnchorClean:fixture.cleanAt(control.anchor),
      directRare,directControl,
      rare:{queries:rare.queries,basesTried:rare.basesTried,corrections:rare.corrections},
      control:{queries:control.queries,basesTried:control.basesTried,corrections:control.corrections}});
  }
  return {rareRecovered,controlRecovered,heldouts,poisonedSources:rows.length,
    rows,dense:denseControls()};
}
if(require.main===module)console.log('SPARSE_REANCHOR '+JSON.stringify(runEvidence()));
module.exports={invertByReanchoring,poisonCanonicalAnchor,denseControls,runEvidence};
