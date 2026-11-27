'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {masksOfWeight}=require('../sims/bounded-degree-oracle-functional-clone');
const {makeBoundedDegreeDefectContractor}=
  require('../sims/exact-quartic-compatible-cegar');

/** @param {number} seed @returns {()=>number} */
function rng(seed){
  let x=seed>>>0;
  return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;};
}

/** @param {number} seed @returns {{bits:number,degree:number,coefficients:Array<[number,number]>,queryCount:number}} */
function denseModel(seed){
  const next=rng(seed);
  /** @type {Array<[number,number]>} */
  const coefficients=[];
  for(let d=0;d<=4;d++)
    for(const mask of masksOfWeight(32,d))coefficients.push([mask,next()]);
  return{bits:32,degree:4,coefficients,queryCount:0};
}

test('dense quartic contractor ABBA measures active-direction lookup versus full term scans',()=>{
  /** @type {Array<{seed:number,termCount:number,directions:number,
   *  scanMs:number[],groupedMs:number[],ratio:number}>} */
  const receipts=[];
  for(const [i,seed] of [0x177a3b12,0x7e771ced].entries()){
    const model=denseModel(seed);
    const scan=makeBoundedDegreeDefectContractor(model,'scan');
    const grouped=makeBoundedDegreeDefectContractor(model,'grouped');
    assert.equal(scan.splitTermCount,grouped.splitTermCount);
    const next=rng(seed^0xf81a34cc);
    const directions=Array.from({length:16},(_,j)=>(2**j)>>>0)
      .concat(Array.from({length:16},()=>next()));
    /** @param {'scan'|'grouped'} method @returns {{elapsed:number,digest:number}} */
    function measure(method){
      const contractor=method==='scan'?scan:grouped;
      let digest=0;
      const start=performance.now();
      for(const v of directions){
        contractor.contract(v,(value,mask)=>{
          digest=(digest^value^mask)>>>0;
        });
      }
      return{elapsed:performance.now()-start,digest};
    }
    // Warm both paths and compare their entire batch output before timing.
    assert.equal(measure('scan').digest,measure('grouped').digest);
    /** @type {Array<'scan'|'grouped'>} */
    const order=i===0?
      ['scan','grouped','grouped','scan','scan','grouped','grouped','scan']:
      ['grouped','scan','scan','grouped','grouped','scan','scan','grouped'];
    /** @type {number[]} */
    const scanMs=[];
    /** @type {number[]} */
    const groupedMs=[];
    let expectedDigest;
    for(const method of order){
      const result=measure(method);
      if(expectedDigest===undefined)expectedDigest=result.digest;
      assert.equal(result.digest,expectedDigest,'scanned and grouped parity diverged');
      (method==='scan'?scanMs:groupedMs).push(result.elapsed);
    }
    const scanMean=scanMs.reduce((a,b)=>a+b,0)/scanMs.length;
    const groupedMean=groupedMs.reduce((a,b)=>a+b,0)/groupedMs.length;
    receipts.push({seed,termCount:scan.splitTermCount,directions:directions.length,
      scanMs:scanMs.map(x=>Math.round(x)),
      groupedMs:groupedMs.map(x=>Math.round(x)),
      ratio:Math.round(scanMean/groupedMean*100)/100});
  }
  console.log('EXACT_QUARTIC_DENSE_GROUPED_ABBA '+JSON.stringify(receipts));
});
