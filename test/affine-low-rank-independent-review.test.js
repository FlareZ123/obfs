'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');

/**
 * Independent finite-field cross-check for the proposed rank-r chosen-query
 * inversion theorem. No production obfuscator or proposed inverter imported.
 * These cases verify exact outputs, including deliberately maximal singular
 * interpolants. They are computational evidence, not a novelty claim.
 */

/** @param {number} initial @returns {()=>number} */
function generator(initial) {
  let state=initial>>>0;
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  };
}

/** @param {number[]} columns @param {number} input @returns {number} */
function map(columns,input) {
  let result=0;
  for(let i=0;i<columns.length;i++)if(input&(1<<i))result^=columns[i];
  return result;
}

/**
 * Independent column-basis construction by descending pivot bit.
 * @param {number[]} columns
 * @param {number} n
 * @returns {{pivots:number[],free:number[]}}
 */
function columnBasis(columns,n) {
  const basis=new Array(n).fill(0);
  /** @type {number[]} */
  const pivots=[];
  /** @type {number[]} */
  const free=[];
  for(let column=0;column<columns.length;column++){
    let v=columns[column];
    let admitted=false;
    for(let bit=n-1;bit>=0;bit--){
      if(!(v&(1<<bit)))continue;
      if(basis[bit])v^=basis[bit];
      else {
        basis[bit]=v;
        pivots.push(column);
        admitted=true;
        break;
      }
    }
    if(!admitted)free.push(column);
  }
  return {pivots,free};
}

/**
 * Gauss-Jordan invert using row-augmented [M | I] representation.
 * @param {number[]} columns
 * @returns {number[]}
 */
function inverse(columns) {
  const n=columns.length;
  const rows=Array.from({length:n},(_,row)=>{
    let bits=1<<(n+row);
    for(let col=0;col<n;col++)if(columns[col]&(1<<row))bits|=1<<col;
    return bits;
  });
  for(let col=0;col<n;col++){
    const pivot=rows.findIndex((value,row)=>row>=col&&(value&(1<<col)));
    assert.notEqual(pivot,-1,'Unexpected singular completion matrix');
    [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
    for(let row=0;row<n;row++){
      if(row!==col&&(rows[row]&(1<<col)))rows[row]^=rows[col];
    }
  }
  return Array.from({length:n},(_,column)=>{
    let value=0;
    for(let row=0;row<n;row++){
      if((rows[row]>>(n+column))&1)value|=1<<row;
    }
    return value;
  });
}

/**
 * @param {number} n
 * @param {()=>number} next
 * @returns {number[]}
 */
function randomInvertible(n,next) {
  const columns=Array.from({length:n},(_,index)=>1<<index);
  for(let step=0;step<12*n;step++){
    const a=next()%n;
    let b=next()%(n-1);
    if(b>=a)b++;
    columns[a]^=columns[b];
    if(next()&1)[columns[a],columns[b]]=[columns[b],columns[a]];
  }
  return columns;
}

/**
 * @param {number[]} values
 * @param {()=>number} next
 * @returns {void}
 */
function shuffle(values,next) {
  for(let i=values.length-1;i>0;i--){
    const j=next()%(i+1);
    [values[i],values[j]]=[values[j],values[i]];
  }
}

/**
 * A permutation conjugating arbitrary per-fiber permutations by two hidden
 * invertible GF(2) matrices. The additive output perturbation rank is <=r.
 * @param {number} n
 * @param {number} r
 * @param {()=>number} next
 * @returns {(x:number)=>number}
 */
function randomFiberOracle(n,r,next) {
  const before=randomInvertible(n,next);
  const after=randomInvertible(n,next);
  const offset=next()% (1<<n);
  const width=1<<r;
  const fibers=Array.from({length:1<<(n-r)},()=>{
    const permutation=Array.from({length:width},(_,i)=>i);
    shuffle(permutation,next);
    return permutation;
  });
  return x=>{
    const z=map(before,x);
    const upper=z>>>r;
    const lower=z&(width-1);
    return map(after,(upper<<r)|fibers[upper][lower])^offset;
  };
}

/**
 * Force a maximal-nullity interpolant of rank n-r while keeping the oracle
 * bijective: the distinct basis-input quotient classes can all be assigned
 * outputs in a single (n-r)-dimensional complement via per-fiber bijections.
 * @param {number} n
 * @param {number} r
 * @param {()=>number} next
 * @returns {(x:number)=>number}
 */
function forcedNullityOracle(n,r,next) {
  const q=n-r, width=1<<r;
  assert.ok(n<(1<<q));
  /** @type {number[]} */
  let quotient=[];
  do {
    quotient=Array.from({length:(1<<q)-1},(_,i)=>i+1);
    shuffle(quotient,next);
    quotient=quotient.slice(0,n);
  }while(columnBasis(quotient,q).pivots.length!==q);

  /** @type {number[]} */
  let coordinates=[];
  do {
    const bottom=Array.from({length:n},()=>next()%width);
    coordinates=quotient.map((value,i)=>value|(bottom[i]<<q));
  }while(columnBasis(coordinates,n).pivots.length!==n);
  const undo=inverse(coordinates);
  const fibers=Array.from({length:1<<q},()=>Array.from({length:width},(_,i)=>i));
  for(let i=0;i<n;i++){
    const quotientClass=quotient[i];
    const oldLower=coordinates[i]>>>q;
    [fibers[quotientClass][oldLower],fibers[quotientClass][0]]=
      [fibers[quotientClass][0],fibers[quotientClass][oldLower]];
  }
  for(let classIndex=1;classIndex<(1<<q);classIndex++){
    if(quotient.includes(classIndex))continue;
    shuffle(fibers[classIndex],next);
  }
  return x=>{
    const z=map(coordinates,x);
    const classIndex=z&((1<<q)-1);
    const lower=z>>>q;
    return map(undo,classIndex|(fibers[classIndex][lower]<<q));
  };
}

/**
 * A separately authored inverse, using row inversion and explicit quotient
 * rank comparisons. The oracle is the ONLY knowledge of the hidden map.
 * @param {(x:number)=>number} oracle
 * @param {number} target
 * @param {number} n
 * @param {number} r
 * @param {()=>number} next
 * @returns {{preimage:number,nullity:number,orbit:number,queries:number}}
 */
function independentInverse(oracle,target,n,r,next) {
  const constant=oracle(0);
  const interpolant=Array.from({length:n},(_,i)=>oracle(1<<i)^constant);
  const {pivots,free}=columnBasis(interpolant,n);
  assert.ok(free.length<=r);
  const basis=pivots.map(index=>interpolant[index]);
  /** @type {number[]} */
  const complement=[];
  let queries=n+1;
  let sampled=0;
  while(complement.length<free.length){
    assert.ok(++sampled<=3000,'Unexpected sample exhaustion');
    const x=next()%(1<<n);
    const residual=oracle(x)^constant^map(interpolant,x);
    queries++;
    if(columnBasis([...basis,residual],n).pivots.length>basis.length){
      basis.push(residual);
      complement.push(residual);
    }
  }
  const completed=interpolant.slice();
  for(let i=0;i<free.length;i++)completed[free[i]]^=complement[i];
  const invert=inverse(completed);
  const wanted=map(invert,target^constant);
  let current=wanted;
  for(let orbit=1;orbit<=(1<<r);orbit++){
    const nextPoint=map(invert,oracle(current)^constant);
    queries++;
    if(nextPoint===wanted){
      assert.equal(oracle(current),target);
      return {preimage:current,nullity:free.length,orbit,queries};
    }
    current=nextPoint;
  }
  throw Error('Orbit exceeded assumed output-rank bound');
}

test('independent rank-r inversion with hidden matrices and arbitrary fiber permutations',()=>{
  const next=generator(0x721a39c4);
  let cases=0,maxOrbit=0;
  /** @type {number[]} */
  const countByNullity=[0,0,0,0,0];
  for(let n=3;n<=8;n++)for(let r=0;r<=Math.min(4,n);r++){
    if(n===r)continue;
    for(let trial=0;trial<60;trial++){
      const oracle=randomFiberOracle(n,r,next);
      for(let sample=0;sample<8;sample++){
        const x=next()%(1<<n);
        const result=independentInverse(oracle,oracle(x),n,r,next);
        assert.equal(result.preimage,x,'failed n='+n+'/r='+r+'/trial='+trial);
        countByNullity[result.nullity]++;
        maxOrbit=Math.max(maxOrbit,result.orbit);
        cases++;
      }
    }
  }
  assert.equal(cases,12960);
  assert.ok(countByNullity[1]>0);
  assert.ok(countByNullity[2]>0);
  assert.ok(maxOrbit<=16);
});

test('independent inversion when affine interpolant has maximum nullity k=r',()=>{
  const next=generator(0x9e61a2f3);
  let cases=0;
  for(const [n,r] of /** @type {[number,number][]} */ ([[6,3],[7,3],[8,4]])){
    for(let trial=0;trial<80;trial++){
      const oracle=forcedNullityOracle(n,r,next);
      for(let sample=0;sample<16;sample++){
        const x=next()%(1<<n);
        const result=independentInverse(oracle,oracle(x),n,r,next);
        assert.equal(result.preimage,x,'wrong inverse n='+n+'/r='+r);
        assert.equal(result.nullity,r,'failed to force maximal interpolant nullity');
        assert.ok(result.orbit<=(1<<r));
        cases++;
      }
    }
  }
  assert.equal(cases,3840);
});
