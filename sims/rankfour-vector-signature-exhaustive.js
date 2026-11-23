'use strict';

const assert = require('node:assert/strict');

/** @type {readonly (readonly [number,number,number])[]} */
const triples = [[0,1,2],[0,1,3],[0,2,3],[1,2,3]];
const basis = [1,2,4,8];

/**
 * Calculate one 3-by-3 minor independently of the tensor coefficients.
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {readonly [number,number,number]} axes
 * @returns {number}
 */
function minor(a,b,c,axes) {
  const [i,j,k]=axes;
  const ap=(a>>>i)&1,aq=(a>>>j)&1,ar=(a>>>k)&1;
  const bp=(b>>>i)&1,bq=(b>>>j)&1,br=(b>>>k)&1;
  const cp=(c>>>i)&1,cq=(c>>>j)&1,cr=(c>>>k)&1;
  return (ap&bq&cr)^(ap&br&cq)^(aq&bp&cr)^
    (aq&br&cp)^(ar&bp&cq)^(ar&bq&cp);
}

/**
 * Basis-free input lookup for all wedges of three four-bit directions.
 * The precomputed bitmask selects 3-form coefficients in canonical
 * exterior basis [012,013,023,123].
 * @returns {Uint8Array}
 */
function wedgeTable() {
  const table=new Uint8Array(4096);
  for(let a=0;a<16;a++)for(let b=0;b<16;b++)for(let c=0;c<16;c++){
    let mask=0;
    for(let i=0;i<4;i++)mask|=minor(a,b,c,triples[i])<<i;
    table[(a<<8)|(b<<4)|c]=mask;
  }
  // Independent Boolean-polynomial control: differentiate the four
  // degree-three basis monomials directly at the origin. This has a
  // different implementation from the determinant/minor construction.
  for(let a=0;a<16;a++)for(let b=0;b<16;b++)for(let c=0;c<16;c++){
    let observed=0;
    for(let subset=0;subset<8;subset++){
      const x=(((subset&1)?a:0)^((subset&2)?b:0)^((subset&4)?c:0));
      for(let i=0;i<4;i++){
        let term=1;
        for(const axis of triples[i])term&=(x>>>axis)&1;
        observed^=term<<i;
      }
    }
    assert.equal(table[(a<<8)|(b<<4)|c],observed,
      'Direct finite-difference basis and determinant wedge disagree');
  }
  return table;
}

/**
 * Run an exhaustive check modulo invertible changes of input basis.
 * Every nonzero tensor/triple witness can be sent to the canonical
 * triple (e0,e1,e2). All 4-output-bit alternating trilinear forms
 * are covered by enumerating 4 arbitrary four-bit coefficient vectors,
 * with the first coefficient nonzero.
 * @returns {{tested:number,skippedNoCanonicalWitness:number,
 *  outputRankCounts:number[],scalarWitnessChecks:number,
 *  scalarWitnessCounts:number[]}}
 */
function main(){
  const wedge=wedgeTable();
  let tested=0,skippedNoCanonicalWitness=0;
  const outputRankCounts=[0,0,0,0,0];
  const scalarWitnessCounts=[];
  let scalarWitnessChecks=0;
  for(let mask=1;mask<16;mask++){
    let nonzero=0;
    for(let a=0;a<16;a++)for(let b=0;b<16;b++)for(let c=0;c<16;c++){
      let projection=wedge[(a<<8)|(b<<4)|c]&mask;
      projection^=projection>>>2;
      projection^=projection>>>1;
      if(projection&1)nonzero++;
      scalarWitnessChecks++;
    }
    scalarWitnessCounts.push(nonzero);
    assert.equal(nonzero,1344,'Every nonzero 3-form has identical witness probability');
  }

  // Tensor output is a four-bit vector. This enumeration covers 2^16
  // coefficient tables, filtered to those with T(e0,e1,e2) nonzero.
  for(let packed=0;packed<65536;packed++){
    const coefficients=[packed&15,(packed>>>4)&15,(packed>>>8)&15,(packed>>>12)&15];
    if(coefficients[0]===0){skippedNoCanonicalWitness++;continue;}
    tested++;
    // Independent output-column Gaussian elimination determines image rank.
    const pivots=new Uint8Array(4);
    let outputRank=0;
    for(const coefficient of coefficients){
      let value=coefficient;
      for(let bit=3;bit>=0;bit--){
        if(!((value>>>bit)&1))continue;
        if(pivots[bit])value^=pivots[bit];
        else {pivots[bit]=value;outputRank++;break;}
      }
    }
    outputRankCounts[outputRank]++;

    const values=new Uint8Array(16);
    for(let mask=1;mask<16;mask++){
      const first=31-Math.clz32(mask&-mask);
      values[mask]=values[mask^(1<<first)]^coefficients[first];
    }
    /** @param {number} a @param {number} b @param {number} c @returns {number} */
    const T=(a,b,c)=>values[wedge[(a<<8)|(b<<4)|c]];
    assert.equal(T(1,2,4),coefficients[0]);
    let signatureKernelSize=0,radicalSize=0;
    for(let x=0;x<16;x++){
      const signatureZero=T(x,2,4)===0 && T(1,x,4)===0 && T(1,2,x)===0;
      let radical=true;
      for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){
        if(T(x,basis[i],basis[j])!==0)radical=false;
      }
      if(signatureZero)signatureKernelSize++;
      if(radical)radicalSize++;
      assert.equal(signatureZero,radical,
        'Signature/radical mismatch: coefficients='+packed+', input='+x);
    }
    const predictedKernelSize=outputRank===1?2:1;
    assert.equal(radicalSize,predictedKernelSize,
      'Unexpected vector 3-form radical dimension for '+packed);
    assert.equal(signatureKernelSize,predictedKernelSize,
      'Unexpected signature rank for '+packed);
  }
  assert.equal(tested,15*16*16*16);
  assert.equal(skippedNoCanonicalWitness,16*16*16);
  assert.equal(outputRankCounts[1],120);
  assert.equal(outputRankCounts.reduce((x,y)=>x+y,0),tested);
  const result={tested,skippedNoCanonicalWitness,outputRankCounts,
    scalarWitnessChecks,scalarWitnessCounts};
  console.log(JSON.stringify(result,null,2));
  return result;
}
if(require.main===module)main();
module.exports={main};
