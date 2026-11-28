'use strict';

const assert=require('node:assert/strict');
const {parse}=require('../src/ast');
const {assertNoSharedChildFunctionIdentity}=require('../src/sco-private-child-function-identity');

/**
 * Reproducible grammar-limited stress test of the source-audited private
 * scalar table ownership proof. This is not full SCO compiler integration,
 * JavaScript semantic equivalence across all grammar, or a protection score.
 *
 * Generate 8,000 private child modules with seeded own-string keys, safe
 * primitive reads, and six different identity/state escapes. Cases are
 * independently labelled from the grammar that constructs them. A separate
 * end-to-end compiler suite exercises 352 positive and negative cases.
 *
 * Run: node sims/sco-private-child-ownership-fuzz.js
 */

/** @param {number} seed @returns {()=>number} */
function random(seed){
  let x=seed>>>0;
  return ()=>{
    x=(Math.imul(x,1664525)+1013904223)>>>0;
    return x/0x100000000;
  };
}

/**
 * @param {number} [samples]
 * @param {number} [seed]
 * @returns {{samples:number,positive:number,negative:number,ms:number,seed:string,node:string}}
 */
function run(samples=8000,seed=0x5c0e2026){
  const rng=random(seed);
  const keys=[
    'n','a','b','λ','a-b','a b','toString','valueOf',
    'length','0','1','42','quote"','back\\slash','snow☃'
  ];
  let positive=0;
  let negative=0;
  const before=process.hrtime.bigint();
  for(let index=0;index<samples;index++){
    const key=keys[Math.floor(rng()*keys.length)];
    const value=Math.floor(rng()*100000);
    const access='table['+JSON.stringify(key)+']';
    const record='const table={'+JSON.stringify(key)+':'+value+'};';
    const kind=index%10;
    /** @type {string} */
    let source;
    const expected=kind===0||kind===8;
    if(kind===0)source=record+'export function next(){return '+access+'+1;}';
    else if(kind===1)source=record+'export function next(){return ++'+access+';}';
    else if(kind===2)source=record+'export function next(){return '+access+'++;}';
    else if(kind===3)source=record+'export function next(){return delete '+access+';}';
    else if(kind===4)source=record+
      'export function next(){const alias=table;return alias['+JSON.stringify(key)+'];}';
    else if(kind===5)source=record+
      'export function next(){return Object.keys(table).length;}';
    else if(kind===6)source=record+
      'export function next(k){return table[k];}';
    else if(kind===7)source='export '+record+
      'export function next(){return '+access+';}';
    else if(kind===8)source=record+'export function next(){return '+access+';}';
    else source=record+'export function next(){return '+access+'.toString();}';
    let allowed=true;
    try{
      assertNoSharedChildFunctionIdentity('private/generated.mjs',parse(source,'module'));
    }catch{
      allowed=false;
    }
    assert.equal(allowed,expected,'Unexpected scalar owner admission: '+source);
    if(allowed)positive++;else negative++;
  }
  const ms=Number(process.hrtime.bigint()-before)/1e6;
  if(samples===8000) {
    assert.equal(positive,1600);
    assert.equal(negative,6400);
  }
  return {samples,positive,negative,ms,seed:'0x'+seed.toString(16),node:process.version};
}

if(require.main===module){
  console.log(JSON.stringify(run()));
}

module.exports={run};
