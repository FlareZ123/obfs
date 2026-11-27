'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {learnBoundedDegreeOracle,evaluateBoundedDegreeModel}=
  require('../sims/bounded-degree-oracle-functional-clone');
const {prepareExactBoundedDegreeInverter,makeBoundedDegreeDefectContractor}=
  require('../sims/exact-quartic-compatible-cegar');
const {binaryRank}=require('../sims/derivative-basis-span');
const {invertBoundedDegreeModelSymbolically}=
  require('../sims/bounded-degree-symbolic-affine-inverse');

/** @param {number} seed @returns {()=>number} */
function random32(seed){
  let state=seed>>>0;
  return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
}
/** @param {number} input @returns {number} */
function parity32(input){
  let x=input>>>0;x^=x>>>16;x^=x>>>8;x^=x>>>4;x&=15;
  return(0x6996>>>x)&1;
}
/** @param {number} input @returns {number} */
function invertibleInner(input){
  let x=input>>>0;x=(x^(x<<5))>>>0;x=(x^(x>>>11))>>>0;x=(x^(x<<17))>>>0;
  return x;
}
/** @param {number} input @returns {number} */
function invertibleOuter(input){
  let x=input>>>0;x=(x^(x>>>7))>>>0;x=(x^(x<<9))>>>0;x=(x^(x>>>13))>>>0;
  return x;
}
/**
 * Build a two-sided-affine triangular permutation with lower-bit
 * parity-products of declared Boolean degree. The source parameters stay
 * in this oracle fixture, not in the trained ANF model or inverter.
 * @param {number} seed
 * @param {2|3|4} degree
 * @returns {(input:number)=>number}
 */
function makeOracle(seed,degree){
  const next=random32(seed);
  const inputOffset=next();
  const outputOffset=next();
  const specs=Array.from({length:32},(_,bit)=>{
    const lowerMask=((2**bit)-1)>>>0;
    const gateMasks=Array.from({length:degree},()=>next()&lowerMask);
    return{linear:next()&lowerMask,constant:next()&1,gateMasks};
  });
  return input=>{
    const x=(invertibleInner(input)^inputOffset)>>>0;
    let z=0;
    for(let bit=0;bit<32;bit++){
      const spec=specs[bit],lower=x&(((2**bit)-1)>>>0);
      let gate=1;
      for(const mask of spec.gateMasks)gate&=parity32(lower&mask);
      const out=((x>>>bit)&1)^parity32(lower&spec.linear)^gate^spec.constant;
      z=(z|(((out&1)<<bit)>>>0))>>>0;
    }
    return(invertibleOuter(z)^outputOffset)>>>0;
  };
}

/** @param {number} value @returns {number} */
function bitCount(value){let x=value>>>0,n=0;while(x){x=(x&(x-1))>>>0;n++;}return n;}

test('exact basis-direction CEGAR inverts degree-two through degree-four affine-wrapped triangular sources',()=>{
  const configs=[
    {degree:2,seed:0x7191a031,queryCount:529,slots:32},
    {degree:3,seed:0x7d142c35,queryCount:5489,slots:528},
    {degree:4,seed:0x71812345,queryCount:41449,slots:5488},
    {degree:4,seed:0x25678012,queryCount:41449,slots:5488}
  ];
  for(const entry of configs){
    const degree=/** @type {2|3|4} */(entry.degree);
    const oracle=makeOracle(entry.seed,degree);
    const model=learnBoundedDegreeOracle(oracle,32,degree);
    assert.equal(model.queryCount,entry.queryCount);
    const nonzeroTop=model.coefficients.filter(([mask,value])=>
      bitCount(mask)===degree&&value!==0).length;
    assert.ok(nonzeroTop>0,'fixture should really exercise its declared highest degree');
    const inverter=prepareExactBoundedDegreeInverter(model);
    assert.equal(inverter.contractions,528);
    assert.equal(inverter.derivativeContractions,32);
    assert.equal(inverter.coefficientSlots,entry.slots);
    assert.ok(inverter.splitTermCount>0);
    const next=random32(entry.seed^0xbad51234);
    for(let sample=0;sample<16;sample++){
      let input=next();
      while(bitCount(input)<=degree)input=next();
      const output=oracle(input);
      assert.equal(inverter.clone(input),output,'ANF clone diverged at an unqueried input');
      assert.equal(inverter.invert(output),input,'offline greedy inverse failed');
      assert.equal(inverter.invertFast(output),input,
        'incremental precomputed-derivative inverse failed');
    }
  }
});

test('quartic low-weight oracle fitting cannot certify an unpromised degree-five source',()=>{
  /** @param {number} x @returns {number} */
  const degreeFive=x=>{
    const input=x>>>0;
    return (input^((input&31)===31?0x80000000:0))>>>0;
  };
  const model=learnBoundedDegreeOracle(degreeFive,32,4);
  assert.equal(model.queryCount,41449);
  const inverter=prepareExactBoundedDegreeInverter(model);
  assert.equal(inverter.clone(31),31);
  assert.notEqual(degreeFive(31),31);
});

/**
 * Optional higher-cost deterministic stress sweep. Keep the regular focused
 * CI test fast; explicitly opt in with OBFS_STRESS_QUARTIC=1 for 24 independent
 * degree-four sources and 192 held-out postfit exact target inversions.
 */
if(process.env.OBFS_STRESS_QUARTIC==='1'){
  test('opt-in 24-seed affine triangular quartic exact inversion stress',()=>{
    for(let index=0;index<24;index++){
      const seed=(0x6e123456+Math.imul(index,0x1020305))>>>0;
      const oracle=makeOracle(seed,4);
      const model=learnBoundedDegreeOracle(oracle,32,4);
      assert.equal(model.queryCount,41449);
      const inverter=prepareExactBoundedDegreeInverter(model);
      assert.equal(inverter.contractions,528);
      assert.equal(inverter.derivativeContractions,32);
      assert.equal(inverter.coefficientSlots,5488);
      const next=random32(seed^0xbad51234);
      for(let sample=0;sample<8;sample++){
        let input=next();
        while(bitCount(input)<=4)input=next();
        const output=oracle(input);
        assert.equal(inverter.clone(input),output,
          'quartic held-out clone diverged at seed '+seed);
        assert.equal(inverter.invert(output),input,
          'quartic held-out inverse diverged at seed '+seed);
        assert.equal(inverter.invertFast(output),input,
          'quartic incremental inverse diverged at seed '+seed);
      }
    }
  });
}


test('sparse degree-four coefficient tables still admit lower-weight derivative slots',()=>{
  // The source monomial requires bit 31. A sparse model carries no explicit
  // zero coefficients for lower-weight masks, yet their defect slots exist.
  const model={bits:32,degree:4,
    coefficients:[[0x80000007,0x80000000]],
    queryCount:0};
  const contractor=makeBoundedDegreeDefectContractor(model);
  assert.equal(contractor.coefficientSlots,5488);
  assert.equal(contractor.splitTermCount,14);
  /** @type {number[]} */
  const first=[];
  contractor.contract(0x80000000,value=>first.push(value));
  assert.deepEqual(first,[0x80000000],
    'a high-bit direction must expose the lower-weight x monomial');
  /** @type {number[]} */
  const zero=[];
  contractor.contract(0,value=>zero.push(value));
  assert.deepEqual(zero,[]);
  /** @type {number[]} */
  const combined=[];
  contractor.contract(0x80000001,value=>combined.push(value));
  assert.deepEqual(combined,[0x80000000,0x80000000,0x80000000],
    'a two-bit direction must expose three distinct x coefficients');
});


test('sparse quartic ANF contractor matches raw second differences on random 32-bit points',()=>{
  let nonzero=0;
  let comparisons=0;
  for(const seed of [0x7a3b1234,0x6cd33f18,0x123ee1b9]){
    const next=random32(seed);
    /** @type {Array<[number,number]>} */
    const coefficients=[
      [0,next()],[1,next()],[0x80000000,next()],
      [0x80000007,0x80000000],[0xf,next()]
    ];
    for(let k=0;k<64;k++){
      const weight=1+(next()%4);
      let mask=0;
      while(bitCount(mask)<weight)mask=(mask|(1<<(next()%32)))>>>0;
      coefficients.push([mask,next()]);
    }
    const model={bits:32,degree:4,coefficients,queryCount:0};
    const contractor=makeBoundedDegreeDefectContractor(model);
    const evaluate=(/** @type {number} */ input)=>
      evaluateBoundedDegreeModel(model,input>>>0)>>>0;
    const vectors=[
      [0,0],[0xffffffff,0x80000000],[0x80000000,0x7],
      [0x12345678,0x87654321],[31,0x80000000]
    ];
    for(let i=0;i<64;i++)vectors.push([next(),next()]);
    for(const [x,v] of vectors){
      const expected=(evaluate(x^v)^evaluate(x)^evaluate(v)^evaluate(0))>>>0;
      let predicted=0;
      contractor.contract(v,(value,monomialMask)=>{
        if(((x&monomialMask)>>>0)===monomialMask)
          predicted=(predicted^value)>>>0;
      });
      assert.equal(predicted,expected,'ANF contractor disagreed with direct second difference');
      if(predicted!==0)nonzero++;
      comparisons++;
    }
  }
  assert.equal(comparisons,3*69);
  assert.ok(nonzero>0,'probe genuinely nonlinear source coefficients');
});


test('a degree-three bijection outside the compatible triangular family fails closed',()=>{
  // An explicitly enumerated bijective 4-bit substitution has a full
  // four-dimensional global defect span, hence no nonzero constant
  // output derivative. Eight independent nibbles give an invertible
  // 32-bit vector map of degree <=3 but with zero global mask space.
  const sbox=[11,13,0,4,1,14,9,3,2,12,5,7,15,10,8,6];
  assert.deepEqual([...sbox].sort((a,b)=>a-b),
    Array.from({length:16},(_,i)=>i));
  /** @type {number[]} */
  const defects=[];
  for(let x=0;x<16;x++){
    for(let direction=0;direction<16;direction++){
      defects.push(sbox[x^direction]^sbox[x]^sbox[direction]^sbox[0]);
    }
  }
  assert.equal(binaryRank(defects,4),4);
  /** @param {number} raw @returns {number} */
  const oracle=raw=>{
    const input=raw>>>0;
    let output=0;
    for(let nibble=0;nibble<8;nibble++){
      output=(output|(sbox[(input>>>(4*nibble))&15]<<(4*nibble)))>>>0;
    }
    return output>>>0;
  };
  const model=learnBoundedDegreeOracle(oracle,32,3);
  assert.equal(model.queryCount,5489);
  for(const sample of [0,0xffffffff,0x12345678,0xabcdef01,0xa5a5a5a5]){
    assert.equal(evaluateBoundedDegreeModel(model,sample),oracle(sample),
      'nontriangular control should still be exactly degree-three cloneable');
  }
  assert.throws(()=>prepareExactBoundedDegreeInverter(model),
    /exact derivative flag unavailable at level 0/,
    'global derivative flag must not be promised for arbitrary cubic permutations');
});


test('exact reusable quartic flags agree with established target-specific symbolic inverse',()=>{
  /** @type {Array<{seed:number,targets:number,flagSetupMs:number,
   *  flagTargetsMs:number,fastTargetsMs:number,symbolicTargetsMs:number}>} */
  const receipts=[];
  for(const seed of [0x71812345,0x61a97123]){
    const oracle=makeOracle(seed,4);
    const model=learnBoundedDegreeOracle(oracle,32,4);
    const next=random32(seed^0xab5f1629);
    /** @type {Array<[number,number]>} */
    const pairs=[];
    for(let i=0;i<24;i++){
      let input=next();while(bitCount(input)<=4)input=next();
      pairs.push([input,oracle(input)]);
    }
    const setupStart=performance.now();
    const flags=prepareExactBoundedDegreeInverter(model);
    const flagSetupMs=performance.now()-setupStart;
    const flagStart=performance.now();
    for(const [input,target] of pairs)
      assert.equal(flags.invert(target),input);
    const flagTargetsMs=performance.now()-flagStart;
    const fastStart=performance.now();
    for(const [input,target] of pairs)
      assert.equal(flags.invertFast(target),input);
    const fastTargetsMs=performance.now()-fastStart;
    const symbolicStart=performance.now();
    for(const [input,target] of pairs){
      const found=invertBoundedDegreeModelSymbolically(model,target);
      assert.equal(found?.input,input);
    }
    const symbolicTargetsMs=performance.now()-symbolicStart;
    receipts.push({seed,targets:pairs.length,
      flagSetupMs:Math.round(flagSetupMs),
      flagTargetsMs:Math.round(flagTargetsMs),
      fastTargetsMs:Math.round(fastTargetsMs),
      symbolicTargetsMs:Math.round(symbolicTargetsMs)});
  }
  console.log('EXACT_QUARTIC_BASIS_VS_SYMBOLIC '+JSON.stringify(receipts));
});


test('exact inversion entrypoints reject non-uint32 targets before coercion',()=>{
  const identity=learnBoundedDegreeOracle(x=>x>>>0,32,2);
  const inverter=prepareExactBoundedDegreeInverter(identity);
  for(const invalid of [-1,2**32,2**32+1,1.9,NaN,Infinity,-Infinity]){
    assert.throws(()=>inverter.invert(invalid),/unsigned 32-bit target/);
    assert.throws(()=>inverter.invertFast(invalid),/unsigned 32-bit target/);
  }
  for(const valid of [0,1,0x80000000,0xffffffff]){
    assert.equal(inverter.invert(valid),valid);
    assert.equal(inverter.invertFast(valid),valid);
  }
});


test('explicit malformed or overdegree coefficient terms are rejected before analysis',()=>{
  const model={bits:32,degree:4,
    coefficients:[[0x80000007,0x80000000]],queryCount:0};
  assert.ok(makeBoundedDegreeDefectContractor(model));
  for(const coefficients of [
    [[-1,1]],[[0,NaN]],[[2**32,1]],[[7,-1]],[[7,1.5]],
    [[0x8000001f,1]]
  ]){
    assert.throws(()=>makeBoundedDegreeDefectContractor({...model,coefficients}),
      /unsigned 32-bit|outside promised degree/);
  }
});


test('source-paired dense quartic complete setup compares scan and grouped derivative strategies',()=>{
  /** @type {Array<{seed:number,order:string[],scanSetupMs:number,groupedSetupMs:number,targets:number}>} */
  const receipts=[];
  for(const [index,seed] of [0x71812345,0x61a97123].entries()){
    const oracle=makeOracle(seed,4);
    const model=learnBoundedDegreeOracle(oracle,32,4);
    /** @type {Array<'scan'|'grouped'>} */
    const order=index===0?['scan','grouped']:['grouped','scan'];
    /** @type {ReturnType<typeof prepareExactBoundedDegreeInverter>|null} */
    let scan=null;
    /** @type {ReturnType<typeof prepareExactBoundedDegreeInverter>|null} */
    let grouped=null;
    let scanSetupMs=0,groupedSetupMs=0;
    for(const strategy of order){
      const started=performance.now();
      const prepared=prepareExactBoundedDegreeInverter(model,{strategy});
      const elapsed=performance.now()-started;
      if(strategy==='scan'){scan=prepared;scanSetupMs=elapsed;}
      else{grouped=prepared;groupedSetupMs=elapsed;}
    }
    assert.ok(scan!==null&&grouped!==null);
    if(scan===null||grouped===null)throw new Error('missing paired strategy');
    assert.equal(scan.contractions,528);
    assert.equal(grouped.contractions,528);
    const next=random32(seed^0x731821cd);
    for(let i=0;i<16;i++){
      const input=next(),target=oracle(input);
      assert.equal(scan.invertFast(target),input);
      assert.equal(grouped.invertFast(target),input);
    }
    receipts.push({seed,order,scanSetupMs:Math.round(scanSetupMs),
      groupedSetupMs:Math.round(groupedSetupMs),targets:16});
  }
  console.log('EXACT_QUARTIC_DENSE_FULL_SETUP '+JSON.stringify(receipts));
});
