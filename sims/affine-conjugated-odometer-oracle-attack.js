'use strict';

/** @typedef {{forwardRows:bigint[], inverseRows:bigint[]}} LinearMapPair */

/** @param {number} seed @returns {()=>number} */
function seeded(seed) {
  let value=seed>>>0;
  return ()=>{
    value^=value<<13;
    value^=value>>>17;
    value^=value<<5;
    return value>>>0;
  };
}

/** @param {bigint} value @returns {number} */
function parityBigInt(value) {
  let parity=0n;
  while(value!==0n){parity^=1n;value&=value-1n;}
  return Number(parity);
}

/** @param {bigint[]} rows @param {bigint} input @returns {bigint} */
function applyLinear(rows,input) {
  let output=0n;
  for(let row=0;row<rows.length;row++){
    if(parityBigInt(rows[row]&input))output|=1n<<BigInt(row);
  }
  return output;
}

/**
 * Invert an invertible GF(2) matrix represented by row masks.
 * @param {bigint[]} rows
 * @param {number} width
 * @returns {bigint[]}
 */
function invertMatrixRows(rows,width) {
  const left=rows.slice();
  const right=Array.from({length:width},(_,i)=>1n<<BigInt(i));
  for(let column=0;column<width;column++){
    let pivot=column;
    while(pivot<width&&!(left[pivot]&(1n<<BigInt(column))))pivot++;
    if(pivot===width)throw new Error('matrix is singular');
    [left[column],left[pivot]]=[left[pivot],left[column]];
    [right[column],right[pivot]]=[right[pivot],right[column]];
    for(let row=0;row<width;row++){
      if(row!==column&&(left[row]&(1n<<BigInt(column)))){
        left[row]^=left[column];
        right[row]^=right[column];
      }
    }
  }
  return right;
}

/**
 * Generate an invertible binary matrix by elementary row operations.
 * @param {number} width
 * @param {number} seed
 * @returns {LinearMapPair}
 */
function makeRandomInvertibleMatrix(width,seed) {
  if(!Number.isInteger(width)||width<1||width>64)throw new RangeError('width must be 1..64');
  const next=seeded(seed);
  const forwardRows=Array.from({length:width},(_,i)=>1n<<BigInt(i));
  for(let step=0;step<30*width;step++){
    const a=next()%width,b=next()%width;
    if(a===b)continue;
    if(next()&1)[forwardRows[a],forwardRows[b]]=[forwardRows[b],forwardRows[a]];
    else forwardRows[a]^=forwardRows[b];
  }
  return {forwardRows,inverseRows:invertMatrixRows(forwardRows,width)};
}

/**
 * Construct F(x)=A^-1((A*x+1) mod 2^n). A is linear over GF(2).
 * @param {LinearMapPair} matrix
 * @param {number} width
 * @returns {(input:bigint)=>bigint}
 */
function makeConjugatedOdometer(matrix,width) {
  const mask=(1n<<BigInt(width))-1n;
  return input=>applyLinear(matrix.inverseRows,
    (applyLinear(matrix.forwardRows,input)+1n)&mask);
}

/**
 * Convert columns of a binary matrix to row masks.
 * @param {bigint[]} columns
 * @param {number} width
 * @returns {bigint[]}
 */
function columnsToRows(columns,width) {
  const rows=Array(width).fill(0n);
  for(let column=0;column<width;column++){
    for(let row=0;row<width;row++){
      if((columns[column]>>BigInt(row))&1n)rows[row]|=1n<<BigInt(column);
    }
  }
  return rows;
}

/**
 * Recover A^-1 from n chosen forward queries. The recurrence is x_0=0,
 * y_k=F(x_k)=A^-1(2^k), x_(k+1)=x_k XOR y_k=A^-1(2^(k+1)-1).
 * Therefore y_k is column k of A^-1.
 * @param {(input:bigint)=>bigint} oracle
 * @param {number} width
 * @returns {{inverseColumns:bigint[],inverseRows:bigint[],forwardRows:bigint[],queries:number}}
 */
function recoverConjugator(oracle,width) {
  let input=0n;
  /** @type {bigint[]} */
  const inverseColumns=[];
  for(let bit=0;bit<width;bit++){
    const output=oracle(input);
    inverseColumns.push(output);
    input^=output;
  }
  const inverseRows=columnsToRows(inverseColumns,width);
  const forwardRows=invertMatrixRows(inverseRows,width);
  return {inverseColumns,inverseRows,forwardRows,queries:width};
}

/**
 * Invert a target after recovering the conjugator.
 * @param {bigint} target
 * @param {{inverseRows:bigint[],forwardRows:bigint[]}} recovered
 * @param {number} width
 * @returns {bigint}
 */
function invertTarget(target,recovered,width) {
  const mask=(1n<<BigInt(width))-1n;
  const hidden=applyLinear(recovered.forwardRows,target);
  return applyLinear(recovered.inverseRows,(hidden-1n)&mask);
}

/** @param {number} width @param {()=>number} next @returns {bigint} */
function randomWord(width,next) {
  let value=0n;
  for(let bit=0;bit<width;bit++)if(next()&1)value|=1n<<BigInt(bit);
  return value;
}

/**
 * Reproduce the n-query attack and validate it on deterministic targets.
 * @param {number} width
 * @param {number} seed
 * @param {number} [targetCount]
 * @returns {{width:number,seed:number,queries:number,matrixRecovered:boolean,
 *   targets:number,targetsInverted:boolean}}
 */
function runExperiment(width,seed,targetCount=20) {
  const matrix=makeRandomInvertibleMatrix(width,seed);
  const oracle=makeConjugatedOdometer(matrix,width);
  const recovered=recoverConjugator(oracle,width);
  const matrixRecovered=recovered.inverseRows.every((row,i)=>row===matrix.inverseRows[i]);
  const next=seeded((seed^0x85ebca6b)>>>0);
  const mask=(1n<<BigInt(width))-1n;
  let targetsInverted=true;
  for(let i=0;i<targetCount;i++){
    const target=randomWord(width,next);
    const preimage=invertTarget(target,recovered,width);
    const expected=applyLinear(matrix.inverseRows,
      (applyLinear(matrix.forwardRows,target)-1n)&mask);
    if(preimage!==expected){targetsInverted=false;break;}
  }
  return {width,seed,queries:recovered.queries,matrixRecovered,targets:targetCount,targetsInverted};
}

module.exports={seeded,parityBigInt,applyLinear,invertMatrixRows,
  makeRandomInvertibleMatrix,makeConjugatedOdometer,columnsToRows,
  recoverConjugator,invertTarget,randomWord,runExperiment};
