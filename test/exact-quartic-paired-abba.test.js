'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {learnBoundedDegreeOracle}=require('../sims/bounded-degree-oracle-functional-clone');
const {prepareExactBoundedDegreeInverter}=
  require('../sims/exact-quartic-compatible-cegar');
const {invertBoundedDegreeModelSymbolically}=
  require('../sims/bounded-degree-symbolic-affine-inverse');

/** @param {number} seed @returns {()=>number} */
function rng(seed){
  let x=seed>>>0;
  return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;};
}
/** @param {number} value @returns {number} */
function parity32(value){
  let x=value>>>0;x^=x>>>16;x^=x>>>8;x^=x>>>4;x&=15;
  return(0x6996>>>x)&1;
}
/** @param {number} input @returns {number} */
function inner(input){
  let x=input>>>0;x=(x^(x<<5))>>>0;x=(x^(x>>>11))>>>0;x=(x^(x<<17))>>>0;
  return x;
}
/** @param {number} input @returns {number} */
function outer(input){
  let x=input>>>0;x=(x^(x>>>7))>>>0;x=(x^(x<<9))>>>0;x=(x^(x>>>13))>>>0;
  return x;
}
/**
 * Independent quartic triangular source with invertible two-sided affine
 * wrappers. The private gate masks never flow to either inverse algorithm.
 * @param {number} seed @returns {(input:number)=>number}
 */
function makeSource(seed){
  const next=rng(seed),insideOffset=next(),outsideOffset=next();
  const gates=Array.from({length:32},(_,bit)=>{
    const lower=((2**bit)-1)>>>0;
    return{
      masks:Array.from({length:4},()=>next()&lower),
      linear:next()&lower,
      constant:next()&1
    };
  });
  return input=>{
    const x=(inner(input)^insideOffset)>>>0;
    let transformed=0;
    for(let bit=0;bit<32;bit++){
      const g=gates[bit],low=x&(((2**bit)-1)>>>0);
      let nonlinear=1;
      for(const mask of g.masks)nonlinear&=parity32(low&mask);
      const output=((x>>>bit)&1)^parity32(low&g.linear)^nonlinear^g.constant;
      transformed=(transformed|((output&1)<<bit))>>>0;
    }
    return(outer(transformed)^outsideOffset)>>>0;
  };
}

/** @param {number} value @returns {number} */
function popcount32(value){let x=value>>>0,n=0;while(x){x=(x&(x-1))>>>0;n++;}return n;}

test('source-paired ABBA quartic flag reuse versus prior symbolic inversion',()=>{
  /** @type {Array<{seed:number,queryCount:number,setupMs:number,
   *  order:string[],fastMs:number[],symbolicMs:number[],
   *  averageFastMsPerTarget:number,averageSymbolicMsPerTarget:number,
   *  impliedBreakEvenTargets:number|null}>} */
  const receipts=[];
  for(const [seedIndex,seed] of [0x71812345,0x61a97123].entries()){
    const oracle=makeSource(seed);
    let oracleCalls=0;
    const model=learnBoundedDegreeOracle(x=>{oracleCalls++;return oracle(x);},32,4);
    assert.equal(oracleCalls,41449);
    assert.ok(model.coefficients.some(([mask,value])=>
      popcount32(mask)===4&&value!==0),'source must truly have degree four');
    const next=rng(seed^0x8fe63720);
    /** @type {Array<[number,number]>} */
    const targets=[];
    for(let i=0;i<12;i++){
      let input=next();while(popcount32(input)<=4)input=next();
      targets.push([input,oracle(input)]);
    }

    const setupStart=performance.now();
    const flags=prepareExactBoundedDegreeInverter(model);
    const setupMs=performance.now()-setupStart;
    assert.equal(flags.contractions,528);
    assert.equal(flags.derivativeContractions,32);
    /** @param {'fast'|'symbolic'} algorithm @returns {number} */
    function runBatch(algorithm){
      const start=performance.now();
      for(const [input,target] of targets){
        const found=algorithm==='fast'?
          flags.invertFast(target):
          invertBoundedDegreeModelSymbolically(model,target)?.input;
        assert.equal(found,input,'paired competitor target mismatch');
      }
      return performance.now()-start;
    }
    // Warm both independent paths, without adding to measured counters.
    runBatch('fast');
    runBatch('symbolic');

    /** @type {Array<'fast'|'symbolic'>} */
    const abba=['fast','symbolic','symbolic','fast'];
    const baab=/** @type {Array<'fast'|'symbolic'>} */(
      ['symbolic','fast','fast','symbolic']);
    const order=[...(seedIndex===0?abba:baab),...(seedIndex===0?abba:baab)];
    /** @type {number[]} */
    const fastMs=[];
    /** @type {number[]} */
    const symbolicMs=[];
    for(const algorithm of order){
      const elapsed=runBatch(algorithm);
      if(algorithm==='fast')fastMs.push(elapsed);
      else symbolicMs.push(elapsed);
    }
    const avgFast=fastMs.reduce((a,b)=>a+b,0)/(fastMs.length*targets.length);
    const avgSymbolic=symbolicMs.reduce((a,b)=>a+b,0)/(symbolicMs.length*targets.length);
    const breakEven=avgSymbolic>avgFast?
      Math.ceil(setupMs/(avgSymbolic-avgFast)):null;
    receipts.push({seed,queryCount:oracleCalls,
      setupMs:Math.round(setupMs),
      order,
      fastMs:fastMs.map(x=>Math.round(x)),
      symbolicMs:symbolicMs.map(x=>Math.round(x)),
      averageFastMsPerTarget:Math.round(avgFast*100)/100,
      averageSymbolicMsPerTarget:Math.round(avgSymbolic*100)/100,
      impliedBreakEvenTargets:breakEven});
    assert.equal(oracleCalls,41449,'no original oracle calls after model fitting');
  }
  console.log('EXACT_QUARTIC_ABBA '+JSON.stringify(receipts));
});
