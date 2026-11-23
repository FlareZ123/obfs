'use strict';

const assert=require('node:assert/strict');

/** @param {number} a @param {number} b @param {number} c @param {number} d @returns {boolean} */
function independent4(a,b,c,d){
  const pivots=new Uint8Array(4);
  for(const input of [a,b,c,d]){
    let x=input;
    for(let bit=3;bit>=0;bit--){
      if(!((x>>>bit)&1))continue;
      if(pivots[bit])x^=pivots[bit];
      else{pivots[bit]=x;break;}
    }
    if(x===0)return false;
  }
  return true;
}

/** @returns {Uint8Array} */
function rankTable(){
  const table=new Uint8Array(65536);
  for(let a=0;a<16;a++)for(let b=0;b<16;b++)
    for(let c=0;c<16;c++)for(let d=0;d<16;d++)
      if(independent4(a,b,c,d))table[(a<<12)|(b<<8)|(c<<4)|d]=1;
  return table;
}

/** @returns {Uint8Array[]} */
function projections(){
  return Array.from({length:5},(_,omit)=>{
    const p=new Uint8Array(32);
    const low=(1<<omit)-1;
    for(let x=0;x<32;x++)p[x]=(x&low)|((x>>>(omit+1))<<omit);
    return p;
  });
}

/**
 * Five 4x4 minors form the exterior coordinates of a 4-wedge in GF(2)^5.
 * @param {number} a @param {number} b @param {number} c @param {number} d
 * @param {Uint8Array[]} p @param {Uint8Array} fullRank
 * @returns {number}
 */
function wedge(a,b,c,d,p,fullRank){
  let mask=0;
  for(let omitted=0;omitted<5;omitted++){
    const q=p[omitted];
    const code=(q[a]<<12)|(q[b]<<8)|(q[c]<<4)|q[d];
    mask|=fullRank[code]<<omitted;
  }
  return mask;
}

/**
 * Independent fourth finite difference of the five degree-four basis
 * monomials. This does not reuse any determinant, rank or projection logic.
 * @param {number} a @param {number} b @param {number} c @param {number} d
 * @returns {number}
 */
function directDifference(a,b,c,d){
  let mask=0;
  for(let omit=0;omit<5;omit++){
    const monomial=31^(1<<omit);
    let parity=0;
    for(let selection=0;selection<16;selection++){
      const input=((selection&1)?a:0)^((selection&2)?b:0)^
        ((selection&4)?c:0)^((selection&8)?d:0);
      parity^=Number((input&monomial)===monomial);
    }
    mask|=parity<<omit;
  }
  return mask;
}

/**
 * Exhaust all ordered four-tuples over GF(2)^5, cross-check independently
 * implemented direct finite differences, and certify output-rank tails.
 * @returns {{orderedTuples:number,dependentTuples:number,nonzeroWedgeCopies:number,
 *    independentChecks:number,witnessesByRank:number[],fractionsByRank:string[]}}
 */
function main(){
  const fullRank=rankTable(),p=projections();
  const histogram=new Uint32Array(32);
  for(let a=0;a<32;a++)for(let b=0;b<32;b++)
    for(let c=0;c<32;c++)for(let d=0;d<32;d++)
      histogram[wedge(a,b,c,d,p,fullRank)]++;
  const orderedTuples=32**4;
  const dependentTuples=histogram[0];
  const copies=histogram[1];
  assert.equal(dependentTuples,423616);
  assert.equal(copies,20160);
  for(let value=1;value<32;value++)assert.equal(histogram[value],copies,
    'Every nonzero 4-wedge must occur uniformly under GL(5,2)');
  assert.equal(dependentTuples+31*copies,orderedTuples);

  let seed=0x51c417d4;
  /** @returns {number} */
  function draw(){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    return seed>>>0;
  }
  const independentChecks=32768;
  for(let i=0;i<independentChecks;i++){
    const a=draw()&31,b=draw()&31,c=draw()&31,d=draw()&31;
    const actual=wedge(a,b,c,d,p,fullRank);
    assert.equal(actual,directDifference(a,b,c,d),
      'Exterior-minor computation must match direct polynomial finite differences');
  }
  const witnessesByRank=[0];
  const fractionsByRank=['0'];
  for(let rank=1;rank<=5;rank++){
    let witnesses=0;
    const projectionMask=(1<<rank)-1;
    for(let value=0;value<32;value++)
      if(value&projectionMask)witnesses+=histogram[value];
    const theoretical=(32-2**(5-rank))*copies;
    assert.equal(witnesses,theoretical);
    witnessesByRank.push(witnesses);
    const divisor=(/** @param {number} a @param {number} b @returns {number} */
      function gcd(a,b){while(b){const remainder=a%b;a=b;b=remainder;}return a;})
      (witnesses,orderedTuples);
    fractionsByRank.push((witnesses/divisor)+'/'+(orderedTuples/divisor));
  }
  assert.equal(fractionsByRank[1],'315/1024');
  assert.equal(fractionsByRank[2],'945/2048');
  const out={orderedTuples,dependentTuples,nonzeroWedgeCopies:copies,
    independentChecks,witnessesByRank,fractionsByRank};
  console.log('RANK_FIVE_FOUR_WEDGE_EXHAUSTIVE '+JSON.stringify(out));
  return out;
}
if(require.main===module)main();
module.exports={main};
