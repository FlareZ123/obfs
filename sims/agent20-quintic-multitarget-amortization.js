'use strict';

const assert=require('node:assert/strict');

/** @typedef {{values:Map<number,number>,query:(input:number)=>number}} QueryCache */
/** @typedef {{anchor:number,base:number,solve:(rhs:number)=>number,attempts:number,failed:Array<{anchor:number,rank:number,queryCount:number}>}} ReanchorBasis */
/** @typedef {{constant:number,nullity:number,inverse:number[],orbitBound:number}} RankTwoBasis */
/** @typedef {{index:number,corrections:number,checks:number}} ReanchorReceipt */
/** @typedef {{index:number,orbitCalls:number}} RankTwoReceipt */
/** @typedef {{
 * width:number,degree:number,targetCount:number,source:string,
 * sourceAudit:{affineRank:number,nonlinearOutputRank:number,canonicalAnchorRank:number,successfulAnchorCompatibleB:boolean},
 * reanchor:{seed:string,failedAnchors:Array<{anchor:string,rank:number,queries:number}>,successfulAnchor:string,basisAttempts:number,perTarget:ReanchorReceipt[],uniqueOracleQueries:number},
 * rankTwo:{rankBound:number,affineNullity:number,orbitBound:number,perTarget:RankTwoReceipt[],uniqueOracleQueries:number},
 * note:string
 * }} AmortizedEvidence */

/** @param {number} seed @returns {()=>number} */
function makeRng(seed){
  let state=seed>>>0;
  return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
}
/** @param {number} seed @returns {number[]} */
function makeLinearTransform(seed){
  const next=makeRng(seed);
  const columns=Array.from({length:32},(_,bit)=>(2**bit)>>>0);
  for(let round=0;round<512;round++){
    const a=next()%32;let b=next()%32;if(a===b)b=(b+1)%32;
    if((next()&1)===0)[columns[a],columns[b]]=[columns[b],columns[a]];
    else columns[b]=(columns[b]^columns[a])>>>0;
  }
  return columns;
}
/** @param {number[]} columns @param {number} input @returns {number} */
function applyLinear(columns,input){
  let x=input>>>0,output=0,bit=0;
  while(x!==0){if(x&1)output^=columns[bit];x>>>=1;bit++;}
  return output>>>0;
}
/** @param {number[]} columns @returns {((rhs:number)=>number)|null} */
function inverseOfColumns(columns){
  if(columns.length!==32)throw new RangeError('Need 32 columns');
  const pivots=Array(32).fill(0),preimages=Array(32).fill(0);
  for(let index=0;index<32;index++){
    let image=columns[index]>>>0,preimage=(2**index)>>>0;
    for(let bit=31;bit>=0&&image!==0;bit--){
      if(((image>>>bit)&1)===0)continue;
      if(pivots[bit]!==0){image=(image^pivots[bit])>>>0;preimage=(preimage^preimages[bit])>>>0;}
      else{pivots[bit]=image;preimages[bit]=preimage;break;}
    }
    if(image===0)return null;
  }
  return rhs=>{
    let image=rhs>>>0,preimage=0;
    for(let bit=31;bit>=0&&image!==0;bit--){
      if(((image>>>bit)&1)===0)continue;
      if(pivots[bit]===0)throw new Error('Missing pivot');
      image=(image^pivots[bit])>>>0;preimage=(preimage^preimages[bit])>>>0;
    }
    if(image!==0)throw new Error('Linear solve did not finish');
    return preimage>>>0;
  };
}
/** @param {number[]} columns @returns {number[]} */
function inverseColumns(columns){
  const bits=columns.length;
  /** @type {Array<{left:number,right:number}>} */
  const rows=[];
  for(let row=0;row<bits;row++){
    let left=0;
    for(let col=0;col<bits;col++)if((columns[col]>>>row)&1)left=(left^(1<<col))>>>0;
    rows.push({left,right:(1<<row)>>>0});
  }
  for(let pivot=0;pivot<bits;pivot++){
    let selected=pivot;
    while(selected<bits&&!((rows[selected].left>>>pivot)&1))selected++;
    if(selected===bits)throw new TypeError('Completion matrix is singular');
    [rows[selected],rows[pivot]]=[rows[pivot],rows[selected]];
    for(let row=0;row<bits;row++){
      if(row!==pivot&&((rows[row].left>>>pivot)&1)){
        rows[row].left=(rows[row].left^rows[pivot].left)>>>0;
        rows[row].right=(rows[row].right^rows[pivot].right)>>>0;
      }
    }
  }
  return Array.from({length:bits},(_,column)=>{
    let value=0;
    for(let row=0;row<bits;row++)if((rows[row].right>>>column)&1)value=(value^(1<<row))>>>0;
    return value;
  });
}
/** @param {number[]} basis @param {number} vector @returns {boolean} */
function extendBasis(basis,vector){
  let value=vector>>>0;
  for(let bit=31;bit>=0;bit--){
    if(((value>>>bit)&1)===0)continue;
    if(basis[bit])value=(value^basis[bit])>>>0;
    else{basis[bit]=value;return true;}
  }
  return false;
}
/** @param {number[]} columns @param {number} input @returns {number} */
function applyColumns(columns,input){
  let output=0;
  for(let bit=0;bit<columns.length;bit++)if((input>>>bit)&1)output=(output^columns[bit])>>>0;
  return output>>>0;
}
/** @param {number[]} vectors @returns {number} */
function rankOfVectors(vectors){
  const basis=Array(32).fill(0);let rank=0;
  for(const vector of vectors)if(extendBasis(basis,vector))rank++;
  return rank;
}
/** @param {(x:number)=>number} oracle @returns {QueryCache} */
function makeCache(oracle){
  const values=new Map();
  /** @param {number} input @returns {number} */
  function query(input){
    const key=input>>>0;
    if(!values.has(key))values.set(key,oracle(key)>>>0);
    return /** @type {number} */ (values.get(key));
  }
  return {values,query};
}
/** @param {number} input @returns {number} */
function quinticCore(input){
  const x=input>>>0;
  return (x^((x&31)===31?128:0)^((x&124)===124?256:0))>>>0;
}
/** @param {QueryCache} cache @param {number} seed @returns {ReanchorBasis} */
function prepareReanchor(cache,seed){
  const draw=makeRng(seed),failed=[];
  for(let attempt=0;attempt<4;attempt++){
    const anchor=draw()>>>0,base=cache.query(anchor);
    const columns=Array.from({length:32},(_,bit)=>
      (cache.query((anchor^(2**bit))>>>0)^base)>>>0);
    const solve=inverseOfColumns(columns);
    if(!solve){failed.push({anchor,rank:rankOfVectors(columns),queryCount:cache.values.size});continue;}
    return {anchor,base,solve,attempts:attempt+1,failed};
  }
  throw new Error('No full-rank reanchor among four bases');
}
/** @param {(x:number)=>number} query @param {ReanchorBasis} basis @param {number} target @returns {{preimage:number,corrections:number,checks:number}} */
function invertWithReanchor(query,basis,target){
  let candidate=(basis.anchor^basis.solve((target^basis.base)>>>0))>>>0;
  let corrections=0,checks=0;
  for(let step=0;step<32;step++){
    const observed=query(candidate);checks++;
    if(observed===(target>>>0))return {preimage:candidate,corrections,checks};
    candidate=(candidate^basis.solve((target^observed)>>>0))>>>0;
    corrections++;
  }
  throw new Error('Reanchor iteration failed exact target verification');
}
/** @param {(x:number)=>number} query @returns {RankTwoBasis} */
function prepareRankTwo(query){
  const constant=query(0);
  const columns=Array.from({length:32},(_,bit)=>(query((2**bit)>>>0)^constant)>>>0);
  const basis=Array(32).fill(0),free=[];
  for(let bit=0;bit<32;bit++)if(!extendBasis(basis,columns[bit]))free.push(bit);
  if(free.length>2)throw new Error('Fixture exceeds rank-two promise');
  const completed=columns.slice();
  for(const column of free){
    let filled=false;
    for(let bit=0;bit<32;bit++){
      const direction=(2**bit)>>>0;
      if(extendBasis(basis,direction)){
        completed[column]=(columns[column]^direction)>>>0;
        filled=true;break;
      }
    }
    if(!filled)throw new Error('Could not complete affine interpolant');
  }
  return {constant,nullity:free.length,inverse:inverseColumns(completed),orbitBound:2**(2+free.length)};
}
/** @param {(x:number)=>number} query @param {RankTwoBasis} basis @param {number} target @returns {{preimage:number,orbitCalls:number}} */
function invertWithRankTwo(query,basis,target){
  const wanted=applyColumns(basis.inverse,(target^basis.constant)>>>0);
  let current=wanted;
  for(let step=1;step<=basis.orbitBound;step++){
    const next=applyColumns(basis.inverse,(query(current)^basis.constant)>>>0);
    if(next===wanted)return {preimage:current,orbitCalls:step};
    current=next;
  }
  throw new Error('Rank-two permutation orbit bound exhausted');
}
/** @returns {AmortizedEvidence} */
function runEvidence(){
  const inputColumns=makeLinearTransform(0x12345678);
  const outputColumns=makeLinearTransform(0x9abcdef0);
  const inputBias=0x13579bdf,outputBias=0x2468ace0;
  /** @param {number} input @returns {number} */
  function oracle(input){
    const hidden=(applyLinear(inputColumns,input)^inputBias)>>>0;
    return (applyLinear(outputColumns,quinticCore(hidden))^outputBias)>>>0;
  }
  const secrets=[0x4f0ff4eb,0xc108ecdd,0xa58a6017,0x34f93989,
    0x640944ac,0x805d7db1,0xc2b25462,0x7cf97486];
  const targets=secrets.map(oracle);
  for(const word of [0,1,2,3,0x80000000,0xffffffff,0x4f0ff4eb])
    assert.equal(quinticCore(quinticCore(word)),word>>>0);
  const affineColumns=Array.from({length:32},(_,bit)=>
    applyLinear(outputColumns,applyLinear(inputColumns,(2**bit)>>>0)));
  const W=[applyLinear(outputColumns,1<<7),applyLinear(outputColumns,1<<8)];
  assert.equal(rankOfVectors(affineColumns),32);
  assert.equal(rankOfVectors(W),2);

  const reanchor=makeCache(oracle),reanchorBasis=prepareReanchor(reanchor,0xdeadbeef);
  assert.equal(reanchorBasis.anchor,0xba8c2458);
  assert.equal(reanchorBasis.attempts,3);
  assert.equal(reanchorBasis.failed.length,2);
  const inputSolve=inverseOfColumns(inputColumns),outputSolve=inverseOfColumns(outputColumns);
  assert.ok(inputSolve&&outputSolve);
  const anchorBase=oracle(reanchorBasis.anchor);
  const anchorColumns=Array.from({length:32},(_,bit)=>
    (oracle((reanchorBasis.anchor^(2**bit))>>>0)^anchorBase)>>>0);
  assert.equal(rankOfVectors(anchorColumns),32);
  const normalizedB=Array.from({length:32},(_,bit)=>{
    const hiddenDirection=inputSolve((2**bit)>>>0);
    return outputSolve(applyColumns(anchorColumns,hiddenDirection));
  });
  const compatibleB=normalizedB.every((column,bit)=>
    (column&((2**bit)-1))===0&&((column>>>bit)&1)===1);
  assert.equal(compatibleB,true,'Successful reanchor must satisfy the source-side compatible-B audit');
  const reanchorReceipts=targets.map((target,index)=>{
    const result=invertWithReanchor(reanchor.query,reanchorBasis,target);
    assert.equal(result.preimage,secrets[index]);
    assert.equal(oracle(result.preimage),target);
    return {index,corrections:result.corrections,checks:result.checks};
  });

  const rankTwo=makeCache(oracle),rankTwoBasis=prepareRankTwo(rankTwo.query);
  assert.equal(rankTwoBasis.nullity,1);
  assert.equal(rankTwoBasis.orbitBound,8);
  const rankTwoReceipts=targets.map((target,index)=>{
    const result=invertWithRankTwo(rankTwo.query,rankTwoBasis,target);
    assert.equal(result.preimage,secrets[index]);
    assert.equal(oracle(result.preimage),target);
    return {index,orbitCalls:result.orbitCalls};
  });
  assert.equal(reanchorReceipts.every(x=>x.corrections===1&&x.checks===2),true);
  assert.deepEqual(rankTwoReceipts.map(x=>x.orbitCalls),[6,7,1,7,2,7,3,7]);
  assert.equal(reanchor.values.size,115);
  assert.equal(rankTwo.values.size,73);
  return {
    width:32,degree:5,targetCount:secrets.length,
    source:'two monomial compatible triangular permutation under fixed dense invertible affine wrappers',
    sourceAudit:{affineRank:32,nonlinearOutputRank:2,
      canonicalAnchorRank:rankOfVectors(Array.from({length:32},(_,bit)=>(oracle(2**bit)^oracle(0))>>>0)),
      successfulAnchorCompatibleB:compatibleB},
    reanchor:{seed:'0xdeadbeef',
      failedAnchors:reanchorBasis.failed.map(x=>({anchor:'0x'+x.anchor.toString(16).padStart(8,'0'),rank:x.rank,queries:x.queryCount})),
      successfulAnchor:'0x'+reanchorBasis.anchor.toString(16).padStart(8,'0'),
      basisAttempts:reanchorBasis.attempts,perTarget:reanchorReceipts,uniqueOracleQueries:reanchor.values.size},
    rankTwo:{rankBound:2,affineNullity:rankTwoBasis.nullity,orbitBound:rankTwoBasis.orbitBound,
      perTarget:rankTwoReceipts,uniqueOracleQueries:rankTwo.values.size},
    note:'Both interpolation/completion bases are learned once and reused across all eight targets; all counts are unique source-oracle inputs.'
  };
}
if(require.main===module)console.log('AGENT20_QUINTIC_MULTITARGET_AMORTIZATION '+JSON.stringify(runEvidence()));
module.exports={runEvidence};
