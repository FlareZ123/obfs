'use strict';

const assert=require('node:assert/strict');

/** @typedef {'add'|'sub'|'mul'|'and'|'or'|'xor'} Opcode */
/** @typedef {{opcode:Opcode,rank:number,probe:number,witnesses:number}} RankRecord */

/** @type {Record<Opcode,(a:number,b:number)=>number>} */
const operations={
  add:(a,b)=>(a+b)|0,
  sub:(a,b)=>(a-b)|0,
  mul:(a,b)=>Math.imul(a,b),
  and:(a,b)=>(a&b)|0,
  or:(a,b)=>(a|b)|0,
  xor:(a,b)=>(a^b)|0
};

/** @param {number[]} values @returns {number} */
function gf2Rank32(values) {
  /** @type {number[]} */
  const basis=Array(32).fill(0);
  let rank=0;
  for(const word of values){
    let value=word>>>0;
    for(let bit=31;bit>=0;bit--){
      if(!((value>>>bit)&1))continue;
      if(basis[bit])value^=basis[bit];
      else {
        basis[bit]=value>>>0;
        rank++;
        break;
      }
    }
  }
  return rank;
}

/**
 * Mixed finite difference, an affine-invariant nonlinear output direction
 * for the chosen left/right pair of 32-bit inputs.
 * @param {(a:number,b:number)=>number} fn
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mixedResidual(fn,a,b) {
  return (fn(a,b)^fn(a,0)^fn(0,b)^fn(0,0))|0;
}

/**
 * Finite exact rank certificates for each public binary semantic boundary.
 * For add/sub the least output bit is affine, proving the matching rank-31
 * upper bound. XOR is affine. The other 32-direction witnesses saturate
 * the 32-bit output. At the isolated query (2,3) each operation is unique.
 * @returns {RankRecord[]}
 */
function screenBinaryOpcodes() {
  /** @type {Record<Opcode,{rank:number,probe:number}>} */
  const expected={
    add:{rank:31,probe:5},sub:{rank:31,probe:-1},
    mul:{rank:32,probe:6},and:{rank:32,probe:2},
    or:{rank:32,probe:3},xor:{rank:0,probe:1}
  };
  /** @type {RankRecord[]} */
  const rows=[];
  for(const opcode of /** @type {Opcode[]} */ (Object.keys(operations))){
    const fn=operations[opcode];
    /** @type {number[]} */
    const witnesses=[];
    for(let bit=0;bit<32;bit++){
      const unit=1<<bit;
      // Multiplication needs 1 * 2^i to witness the output bit i;
      // the other operators use the equal-bit input pair 2^i,2^i.
      const left=opcode==='mul'?1:unit;
      witnesses.push(mixedResidual(fn,left,unit));
    }
    const rank=gf2Rank32(witnesses);
    const probe=fn(2,3);
    assert.equal(rank,expected[opcode].rank);
    assert.equal(probe,expected[opcode].probe);
    rows.push({opcode,rank,probe,witnesses:witnesses.length});
  }
  assert.equal(new Set(rows.map(row=>row.probe)).size,6);
  return rows;
}

if(require.main===module)console.log(JSON.stringify(screenBinaryOpcodes(),null,2));
module.exports={operations,gf2Rank32,mixedResidual,screenBinaryOpcodes};
