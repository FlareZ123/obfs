'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {
  makeRng,makeLinearTransform,applyLinear,u32
}=require('../sims/compatible-permutation-linear-sandwich-blackbox');
const {learnBoundedDegreeOracle,evaluateBoundedDegreeModel}=
  require('../sims/bounded-degree-oracle-functional-clone');
const {prepareExactCubicInverter,prepareExactCubicTransportInverter}=
  require('../sims/exact-cubic-compatible-cegar');
const {invertBoundedDegreeModelSymbolically}=
  require('../sims/bounded-degree-symbolic-affine-inverse');

/** @param {number} word @returns {number} */
function parity(word){
  let x=word>>>0;x^=x>>>16;x^=x>>>8;x^=x>>>4;x&=15;
  return(0x6996>>>x)&1;
}

/**
 * A seed-stable 32-bit triangular permutation with independent affine,
 * quadratic and cubic components. The cubic gate is intentionally built
 * independently of the coefficient-contraction implementation and has
 * nonzero degree-three terms in the final output coordinate.
 * @param {number} seed
 * @returns {(input:number)=>number}
 */
function makeCubicWrappedSource(seed){
  const next=makeRng(seed^0x24152a11);
  const gates=Array.from({length:32},(_,bit)=>{
    const lower=bit===0?0:u32(2**bit-1);
    const linear=next()&lower;
    const quadA=next()&lower,quadB=next()&lower;
    const cubicA=next()&lower,cubicB=next()&lower,cubicC=next()&lower;
    return{linear,quadA,quadB,cubicA,cubicB,cubicC,constant:next()&1};
  });
  const inColumns=makeLinearTransform(seed^0x12345),outColumns=makeLinearTransform(seed^0x45678);
  const offsets=makeRng(seed^0xabcdef01);
  const inBias=offsets(),outBias=offsets();
  return input=>{
    const x=u32(applyLinear(inColumns,input)^inBias);
    let y=x;
    for(let bit=0;bit<32;bit++){
      const g=gates[bit];
      const low=bit===0?0:x&u32(2**bit-1);
      let flip=g.constant^parity(low&g.linear);
      flip^=parity(low&g.quadA)&parity(low&g.quadB);
      flip^=(parity(low&g.cubicA)&parity(low&g.cubicB)&parity(low&g.cubicC));
      if(flip)y=u32(y^u32(2**bit));
    }
    return u32(applyLinear(outColumns,y)^outBias);
  };
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @param {()=>unknown} operation @returns {number} */
function timed(operation){
  const start=performance.now();
  operation();
  return performance.now()-start;
}

/**
 * All target outputs are generated before timing, both branches share
 * exact same full ANF source model and target order. No remote query or
 * startup initialization enters the compared offline timings. Timings are
 * diagnostics only: do not assert them as CI gates or product compute ratios.
 *
 * @param {number} seed
 * @returns {{seed:number,degreeThreeCoefficients:number,trainingQueries:number,
 *  targets:number,preparationMs:number,symbolicMedianMs:number,
 *  cubicReuseMedianMs:number,cubicReuseTotalMs:number,
 *  symbolicTotalMs:number,breakEvenTargets:number|null,
 *  transportPreparationMs:number,transportReuseMedianMs:number,
 *  transportTotalMs:number,transportBreakEvenTargets:number|null,
 *  transportCoefficientVectors:number,transportXors:number,
 *  allMatched:boolean,offlineContractions:number}}
 */
function runComparison(seed){
  const original=makeCubicWrappedSource(seed);
  let remoteCalls=0;
  const model=learnBoundedDegreeOracle(x=>{remoteCalls++;return original(x);},32,3);
  if(remoteCalls!==5489)throw new Error('expected 5489 chosen oracle calls');
  const next=makeRng(seed^0x9e3779b9);
  const secrets=Array.from({length:24},()=>next());
  const targets=secrets.map(original);
  for(let i=0;i<targets.length;i++){
    assert.equal(evaluateBoundedDegreeModel(model,secrets[i]),targets[i]);
  }

  // Warm all three paths, including compilation/JIT, outside timing.
  for(let i=0;i<2;i++){
    const existing=prepareExactCubicInverter(model);
    const transport=prepareExactCubicTransportInverter(model);
    assert.equal(existing.invert(targets[i]),secrets[i]);
    assert.equal(transport.invert(targets[i]),secrets[i]);
    assert.equal(invertBoundedDegreeModelSymbolically(model,targets[i])?.input,secrets[i]);
  }

  /** @type {number[]} */
  const preparatory=[];
  /** @type {number[]} */
  const transportPreparatory=[];
  for(let repeat=0;repeat<5;repeat++){
    preparatory.push(timed(()=>prepareExactCubicInverter(model)));
    transportPreparatory.push(timed(()=>prepareExactCubicTransportInverter(model)));
  }
  const selected=prepareExactCubicInverter(model);
  const transported=prepareExactCubicTransportInverter(model);
  assert.equal(selected.offlineContractions,5984);
  assert.equal(transported.offlineCoefficientVectors,453376);
  /** @type {number[]} */
  const cubicTimes=[];
  /** @type {number[]} */
  const symbolicTimes=[];
  /** @type {number[]} */
  const transportTimes=[];
  const orders=[
    ['symbolic','reuse','transport'],
    ['transport','reuse','symbolic'],
    ['reuse','transport','symbolic'],
    ['symbolic','transport','reuse'],
    ['transport','symbolic','reuse']
  ];
  for(let repeat=0;repeat<orders.length;repeat++){
    // Rotated order limits one-sided drift without implying independence.
    for(const label of orders[repeat]){
      const took=timed(()=>{
        for(let i=0;i<targets.length;i++){
          if(label==='reuse'){
            assert.equal(selected.invert(targets[i]),secrets[i]);
          }else if(label==='transport'){
            assert.equal(transported.invert(targets[i]),secrets[i]);
          }else{
            assert.equal(invertBoundedDegreeModelSymbolically(model,targets[i])?.input,secrets[i]);
          }
        }
      });
      if(label==='reuse')cubicTimes.push(took);
      else if(label==='transport')transportTimes.push(took);
      else symbolicTimes.push(took);
    }
  }
  const prep=median(preparatory),reuse=median(cubicTimes),symbolic=median(symbolicTimes);
  const transportPrep=median(transportPreparatory),transportReuse=median(transportTimes);
  const perReuse=reuse/targets.length,perSymbolic=symbolic/targets.length;
  const delta=perSymbolic-perReuse;
  const fastDelta=perSymbolic-transportReuse/targets.length;
  return{
    seed,degreeThreeCoefficients:model.coefficients.filter(([mask,value])=>{
      let x=mask>>>0,n=0;
      while(x!==0){x&=x-1;n++;}
      return n===3&&value!==0;
    }).length,
    trainingQueries:remoteCalls,targets:targets.length,
    preparationMs:prep,symbolicMedianMs:symbolic,cubicReuseMedianMs:reuse,
    cubicReuseTotalMs:prep+reuse,symbolicTotalMs:symbolic,
    breakEvenTargets:delta>0?Math.ceil(prep/delta):null,
    transportPreparationMs:transportPrep,
    transportReuseMedianMs:transportReuse,
    transportTotalMs:transportPrep+transportReuse,
    transportBreakEvenTargets:fastDelta>0?Math.ceil(transportPrep/fastDelta):null,
    transportCoefficientVectors:transported.offlineCoefficientVectors,
    transportXors:transported.tensorTransportXors,
    allMatched:true,offlineContractions:selected.offlineContractions
  };
}

test('cubic exact-certificate inverter and existing symbolic ANF inverter agree on same model and targets',()=>{
  const rows=[0x12004931,0x12005931,0x12006931].map(runComparison);
  for(const row of rows){
    assert.equal(row.trainingQueries,5489);
    assert.equal(row.targets,24);
    assert.ok(row.degreeThreeCoefficients>0,'source family must really have degree-three monomials');
    assert.equal(row.offlineContractions,5984);
    assert.equal(row.transportCoefficientVectors,453376);
    assert.ok(row.transportPreparationMs>=0);
    assert.ok(row.transportReuseMedianMs>=0);
    assert.ok(row.transportXors>=0);
    assert.equal(row.allMatched,true);
    assert.ok(row.preparationMs>=0);
    assert.ok(row.symbolicMedianMs>=0);
    assert.ok(row.cubicReuseMedianMs>=0);
  }
  console.log('EXACT_CUBIC_VS_SYMBOLIC_SAME_MODEL '+JSON.stringify(rows));
});

module.exports={runComparison};
