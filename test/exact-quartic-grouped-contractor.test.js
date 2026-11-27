'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {masksOfWeight,learnBoundedDegreeOracle,evaluateBoundedDegreeModel}=
  require('../sims/bounded-degree-oracle-functional-clone');
const {makeBoundedDegreeDefectContractor,prepareExactBoundedDegreeInverter}=
  require('../sims/exact-quartic-compatible-cegar');

/** @param {number} seed @returns {()=>number} */
function random32(seed){
  let x=seed>>>0;
  return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;};
}

/**
 * An independently generated dense vector quartic; not assumed to be
 * bijective, and used only to compare exact polynomial defect contractions.
 * @param {number} seed
 * @returns {{bits:number,degree:number,coefficients:Array<[number,number]>,queryCount:number}}
 */
function denseModel(seed){
  const next=random32(seed);
  /** @type {Array<[number,number]>} */
  const coefficients=[];
  for(let d=0;d<=4;d++){
    for(const mask of masksOfWeight(32,d))coefficients.push([mask,next()]);
  }
  return{bits:32,degree:4,coefficients,queryCount:0};
}

/** @param {ReturnType<typeof makeBoundedDegreeDefectContractor>} contractor @param {number} v @returns {Map<number,number>} */
function contracted(contractor,v){
  /** @type {Map<number,number>} */
  const terms=new Map();
  contractor.contract(v,(value,mask)=>terms.set(mask,value));
  return terms;
}

/**
 * Triangular degree-four bijection with two affine invertible wrappers;
 * the polynomial coefficients of both wrappers remain hidden from the
 * exact contracted-only inverter until after chosen-query training.
 * @param {number} seed
 * @returns {(input:number)=>number}
 */
function triangularOracle(seed){
  const next=random32(seed),inBias=next(),outBias=next();
  /** @param {number} input @returns {number} */
  function inside(input){
    let x=(input^inBias)>>>0;
    x=(x^(x<<5))>>>0;x=(x^(x>>>11))>>>0;x=(x^(x<<17))>>>0;
    return x;
  }
  /** @param {number} input @returns {number} */
  function outside(input){
    let x=input>>>0;
    x=(x^(x>>>7))>>>0;x=(x^(x<<9))>>>0;x=(x^(x>>>13))>>>0;
    return(x^outBias)>>>0;
  }
  return input=>{
    const x=inside(input>>>0);
    const first=(x&0xf)===0xf?0x80000000:0;
    const second=(x&0x70)===0x70?0x40000000:0;
    const third=(x&0xf00)===0xf00?0x20000000:0;
    return outside((x^first^second^third)>>>0);
  };
}

test('grouped direction subset evaluation reproduces scan defect coefficients exactly',()=>{
  let checked=0;
  for(const seed of [0x177a3b12,0x7e771ced]){
    const model=denseModel(seed);
    const scan=makeBoundedDegreeDefectContractor(model);
    const grouped=makeBoundedDegreeDefectContractor(model,'grouped');
    assert.equal(scan.coefficientSlots,5488);
    assert.equal(grouped.coefficientSlots,scan.coefficientSlots);
    assert.equal(grouped.splitTermCount,scan.splitTermCount);
    const next=random32(seed^0x45c8f4ed);
    const directions=[0,1,0x80000000,0xffffffff,0xabcdef01,0x12345678];
    for(let j=0;j<16;j++)directions.push(next());
    for(const v of directions){
      const a=contracted(scan,v),b=contracted(grouped,v);
      assert.deepEqual([...b.entries()],[...a.entries()],
        'grouped coefficient parity diverged on direction '+v);
      checked++;
    }
  }
  assert.equal(checked,44);
});

test('grouped strategy gives exact target inversion on an independently constructed quartic permutation',()=>{
  for(const seed of [0x13b7e812,0x5d7e11a3]){
    const oracle=triangularOracle(seed);
    const model=learnBoundedDegreeOracle(oracle,32,4);
    assert.equal(model.queryCount,41449);
    const original=prepareExactBoundedDegreeInverter(model);
    const grouped=prepareExactBoundedDegreeInverter(model,{strategy:'grouped'});
    assert.equal(original.contractions,528);
    assert.equal(grouped.contractions,528);
    assert.equal(grouped.derivativeContractions,32);
    const next=random32(seed^0x91827463);
    for(let i=0;i<20;i++){
      const input=next(),target=oracle(input);
      assert.equal(evaluateBoundedDegreeModel(model,input),target);
      assert.equal(grouped.invertFast(target),input);
      assert.equal(grouped.invert(target),input);
      assert.equal(original.invertFast(target),input);
    }
  }
});

test('grouped versus scan setup timing is reported separately from correctness',()=>{
  /** @type {Array<{seed:number,scanSetupMs:number,groupedSetupMs:number,scanContractions:number,groupedContractions:number}>} */
  const results=[];
  for(const seed of [0x47110081,0x5d742823]){
    const model=learnBoundedDegreeOracle(triangularOracle(seed),32,4);
    // Warm both branches on one small nonlinear map so the comparison is
    // not a one-sided uninitialized-function versus warmed-function test.
    const warm={bits:32,degree:4,coefficients:[[0xf,1]],queryCount:0};
    makeBoundedDegreeDefectContractor(warm).contract(0xf,()=>{});
    makeBoundedDegreeDefectContractor(warm,'grouped').contract(0xf,()=>{});
    const scanStart=performance.now();
    const scan=prepareExactBoundedDegreeInverter(model);
    const scanSetupMs=performance.now()-scanStart;
    const groupedStart=performance.now();
    const grouped=prepareExactBoundedDegreeInverter(model,{strategy:'grouped'});
    const groupedSetupMs=performance.now()-groupedStart;
    assert.equal(scan.invertFast(model.coefficients[0][1]),grouped.invertFast(model.coefficients[0][1]));
    results.push({seed,scanSetupMs:Math.round(scanSetupMs),
      groupedSetupMs:Math.round(groupedSetupMs),
      scanContractions:scan.contractions,groupedContractions:grouped.contractions});
  }
  console.log('EXACT_QUARTIC_GROUPED_SETUP '+JSON.stringify(results));
});


test('grouped contractor exactly matches scanned degree-two and degree-three polynomial defects',()=>{
  let comparisons=0;
  for(const degree of [2,3]){
    const next=random32(0x8f713baa^degree);
    /** @type {Array<[number,number]>} */
    const coefficients=[];
    for(let weight=0;weight<=degree;weight++)
      for(const mask of masksOfWeight(32,weight))
        coefficients.push([mask,next()]);
    const model={bits:32,degree,coefficients,queryCount:0};
    const scan=makeBoundedDegreeDefectContractor(model,'scan');
    const grouped=makeBoundedDegreeDefectContractor(model,'grouped');
    assert.equal(scan.splitTermCount,grouped.splitTermCount);
    for(const direction of [0,1,0x80000000,0xffffffff,0x7f7f7f7f,0x01010101,
      ...Array.from({length:32},()=>next())]){
      assert.deepEqual([...contracted(grouped,direction)],
        [...contracted(scan,direction)],
        'grouped lower-degree exact coefficient mismatch');
      comparisons++;
    }
  }
  assert.equal(comparisons,76);
});
