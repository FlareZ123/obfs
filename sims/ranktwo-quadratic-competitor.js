'use strict';

const assert=require('node:assert/strict');
const {clone:polarClone,evaluate:polarEvaluate}=require('./ranktwo-polarization-oracle-clone');
const {cloneInHashBasis}=require('./rankthree-random-basis-attack');

/** @param {number} seed @returns {()=>number} */
function seeded(seed){
  let value=seed>>>0;
  return ()=>{value^=value<<13;value^=value>>>17;value^=value<<5;return value>>>0;};
}
/** @param {number[]} columns @param {number} x @returns {number} */
function apply(columns,x){
  let value=0;
  for(let i=0;i<columns.length;i++)if((x>>>i)&1)value^=columns[i];
  return value>>>0;
}
/** @param {number} value @returns {number} */
function parity(value){
  let x=value>>>0;
  x^=x>>>16;x^=x>>>8;x^=x>>>4;x^=x>>>2;x^=x>>>1;
  return x&1;
}
/**
 * Source-known rank-at-most-two quadratic with affine/nongeneric case.
 * No invertibility promise on output or the overall function.
 * @param {()=>number} draw
 * @param {'generic'|'late'|'affine'} kind
 * @returns {(x:number)=>number}
 */
function makeOracle(draw,kind){
  const columns=Array.from({length:32},()=>draw());
  const offset=draw();
  let first=draw(),second=draw();
  if(first===0)first=1;
  if(second===0||second===first)second=(first^0x80000000)>>>0;
  if(kind==='late'){
    first=(1<<30)>>>0;
    second=(1<<31)>>>0;
  }
  const coefficient=kind==='affine'?0:(draw()||1);
  return x=>{
    const quadratic=parity(first&x)&parity(second&x);
    return (apply(columns,x)^offset^(quadratic?coefficient:0))>>>0;
  };
}
/** @param {number[]} inputs @returns {{min:number,max:number,mean:number,median:number}} */
function describe(inputs){
  const sorted=inputs.slice().sort((a,b)=>a-b);
  return {
    min:sorted[0],max:sorted[sorted.length-1],
    mean:sorted.reduce((a,b)=>a+b,0)/sorted.length,
    median:sorted[sorted.length/2]
  };
}
function main(){
  const draw=seeded(0x8f395f2d);
  /** @type {Array<{kind:string,models:number,heldouts:number,polar:ReturnType<typeof describe>,exact:ReturnType<typeof describe>,polarWins:number,exactWins:number,ties:number}>} */
  const groups=[];
  for(const kind of /** @type {const} */ (['generic','late','affine'])){
    /** @type {number[]} */
    const legacyCosts=[];
    /** @type {number[]} */
    const exactCosts=[];
    let heldouts=0,polarWins=0,exactWins=0,ties=0;
    for(let iteration=0;iteration<48;iteration++){
      const oracle=makeOracle(draw,kind);
      const seed=draw();
      let online=true;
      const legacy=polarClone(x=>{
        if(!online)throw Error('Polar model requested private oracle after training');
        return oracle(x);
      },32,seeded(seed));
      online=false;
      assert.ok(legacy.queries<=244);
      let onlineExact=true;
      const exact=cloneInHashBasis(x=>{
        if(!onlineExact)throw Error('Rank-certified model requested oracle after training');
        return oracle(x);
      },32,2,seed);
      onlineExact=false;
      assert.ok(exact.queries<=529);
      for(let test=0;test<256;test++){
        const x=draw();
        const target=oracle(x);
        assert.equal(polarEvaluate(legacy,x),target);
        assert.equal(exact.evaluate(x),target);
        heldouts++;
      }
      legacyCosts.push(legacy.queries);
      exactCosts.push(exact.queries);
      if(legacy.queries<exact.queries)polarWins++;
      else if(exact.queries<legacy.queries)exactWins++;
      else ties++;
    }
    groups.push({
      kind,models:legacyCosts.length,heldouts,
      polar:describe(legacyCosts),exact:describe(exactCosts),
      polarWins,exactWins,ties
    });
  }
  console.log('RANKTWO_COMPETITOR_BUDGET '+JSON.stringify({
    source:'same rank<=2 quadratic family with arbitrary affine output',
    groups,seed:'0x8f395f2d',strictExactQueries:529,
    polarConfidenceBound:'244 chosen queries at 1e-10 ideal independent-uniform witness failure',
    caveat:'Seeded xorshift tests validate only the fixed transcripts; they do not prove stochastic confidence'
  }));
}
if(require.main===module)main();
module.exports={main};
