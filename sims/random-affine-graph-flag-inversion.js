'use strict';

const MASK64=0xffffffffffffffffn;

/** @param {number} seed @returns {()=>number} */
function seeded32(seed) {
  let value=seed>>>0;
  return ()=>{
    value^=value<<13;
    value^=value>>>17;
    value^=value<<5;
    return value>>>0;
  };
}

/**
 * Deterministic test PRNG. The theorem assumes independent uniform coordinates;
 * production callers should inject a cryptographically secure sampler instead.
 * @param {number} seed
 * @returns {(width:number)=>bigint}
 */
function makeSeededRandomCoordinates(seed) {
  let state=(BigInt(seed>>>0)^0x9e3779b97f4a7c15n)&MASK64;
  if(state===0n)state=1n;
  return width=>{
    let value=0n;
    for(let offset=0;offset<width;offset+=64){
      state^=state>>12n;
      state^=(state<<25n)&MASK64;
      state^=state>>27n;
      const output=(state*0x2545f4914f6cdd1dn)&MASK64;
      const take=Math.min(64,width-offset);
      value|=(output&((1n<<BigInt(take))-1n))<<BigInt(offset);
    }
    return value;
  };
}

/** @param {bigint} value @returns {number} */
function parity(value) {
  let result=0n;
  while(value){result^=1n;value&=value-1n;}
  return Number(result);
}

/** @param {bigint[]} rows @param {bigint} input @returns {bigint} */
function applyLinear(rows,input) {
  let output=0n;
  for(let i=0;i<rows.length;i++)if(parity(rows[i]&input))output|=1n<<BigInt(i);
  return output;
}

/**
 * Invert a GF(2) matrix represented by row masks.
 * @param {bigint[]} rows
 * @param {number} width
 * @returns {bigint[]}
 */
function invertRows(rows,width) {
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

/** @param {number} width @param {()=>number} next @returns {bigint[]} */
function randomRows(width,next) {
  const rows=Array.from({length:width},(_,i)=>1n<<BigInt(i));
  for(let step=0;step<30*width;step++){
    const a=next()%width,b=next()%width;
    if(a===b)continue;
    if(next()&1)[rows[a],rows[b]]=[rows[b],rows[a]];
    else rows[a]^=rows[b];
  }
  return rows;
}

/** @param {bigint} value @returns {number} */
function popcount(value) {
  let count=0;
  while(value){value&=value-1n;count++;}
  return count;
}

/**
 * Build a triangular permutation P_i(z)=z_i XOR h_i(z_<i), with sparse
 * random ANF terms of degree at most D. Used only as reproducible test input.
 * @param {number} width
 * @param {number} degree
 * @param {number} seed
 * @param {number} [termsPerBit]
 * @returns {(input:bigint)=>bigint}
 */
function makeTriangular(width,degree,seed,termsPerBit=6) {
  const next=seeded32(seed);
  const terms=Array.from({length:width},()=>[]);
  const constants=Array.from({length:width},()=>next()&1);
  for(let bit=0;bit<width;bit++){
    const max=Math.min(degree,bit);
    if(max<2)continue;
    const seen=new Set();
    for(let term=0;term<termsPerBit;term++){
      const termDegree=2+(next()%(max-1));
      let mask=0n;
      while(popcount(mask)<termDegree){
        const j=next()%bit;
        mask|=1n<<BigInt(j);
      }
      const key=mask.toString();
      if(!seen.has(key)){seen.add(key);terms[bit].push(mask);}
    }
  }
  if(degree>=2&&width>degree)terms[width-1].push((1n<<BigInt(degree))-1n);
  return input=>{
    let output=0n;
    for(let bit=0;bit<width;bit++){
      let value=Number((input>>BigInt(bit))&1n)^constants[bit];
      for(const mask of terms[bit])if((input&mask)===mask)value^=1;
      output|=BigInt(value)<<BigInt(bit);
    }
    return output;
  };
}

/**
 * Generate a two-sided affine-wrapped triangular permutation for experiments.
 * @param {number} width
 * @param {number} degree
 * @param {number} seed
 * @returns {{oracle:(input:bigint)=>bigint,inputRows:bigint[],outputRows:bigint[]}}
 */
function makeRandomTriangularOracle(width,degree,seed) {
  if(width<2||width>64||degree<1||degree>width)throw new RangeError('width 2..64 and degree 1..width required');
  const next=seeded32(seed);
  const inputRows=randomRows(width,next);
  const outputRows=randomRows(width,next);
  const triangular=makeTriangular(width,degree,seed^0x7f4a7c15);
  return {
    oracle:input=>applyLinear(outputRows,triangular(applyLinear(inputRows,input))),
    inputRows,
    outputRows
  };
}

/** @param {bigint[]} pivots @param {bigint} row @param {number} width @returns {boolean} */
function addRow(pivots,row,width) {
  for(let bit=width-1;bit>=0;bit--){
    if(!((row>>BigInt(bit))&1n))continue;
    if(pivots[bit])row^=pivots[bit];
    else{pivots[bit]=row;return true;}
  }
  return false;
}

/**
 * Return a basis for the nullspace of the row-echelon matrix.
 * @param {bigint[]} pivots
 * @param {number} width
 * @returns {bigint[]}
 */
function nullspace(pivots,width) {
  const free=[];
  for(let i=0;i<width;i++)if(!pivots[i])free.push(i);
  const basis=[];
  for(const freeBit of free){
    let vector=1n<<BigInt(freeBit);
    for(let pivot=0;pivot<width;pivot++){
      if(pivots[pivot]&&parity(pivots[pivot]&vector))vector|=1n<<BigInt(pivot);
    }
    basis.push(vector);
  }
  return basis;
}

/** @param {bigint} base @param {bigint[]} basis @param {bigint} coordinates @returns {bigint} */
function combine(base,basis,coordinates) {
  let input=base;
  for(let i=0;i<basis.length;i++)if((coordinates>>BigInt(i))&1n)input^=basis[i];
  return input;
}

/** @param {bigint} value @param {number} width @returns {number} */
function firstSetBit(value,width) {
  for(let i=0;i<width;i++)if((value>>BigInt(i))&1n)return i;
  return -1;
}

/**
 * Learn one nonconstant affine output relation on the current affine coset.
 * A fresh sample increases rank with probability at least 2^-D until the
 * sampled graph span is complete (Reed-Muller minimum-distance bound).
 * @param {(input:bigint)=>bigint} oracle
 * @param {bigint} target
 * @param {bigint} base
 * @param {bigint[]} basis
 * @param {number} width
 * @param {number} degree
 * @param {(width:number)=>bigint} randomCoordinates
 * @param {number} stageDelta
 * @param {number} maxQueriesPerStage
 * @returns {object}
 */
function findRelation(oracle,target,base,basis,width,degree,randomCoordinates,stageDelta,maxQueriesPerStage) {
  const dimension=basis.length;
  const rowWidth=dimension+width+1;
  const inputMask=(1n<<BigInt(dimension))-1n;
  const outputMask=(1n<<BigInt(width))-1n;
  const pivots=Array(rowWidth).fill(0n);
  const stagnationLimit=Math.ceil((2**degree)*Math.log(1/stageDelta));
  let rank=0,stagnant=0,queries=0;
  while(stagnant<stagnationLimit){
    const coordinates=randomCoordinates(dimension);
    const input=combine(base,basis,coordinates);
    const output=oracle(input);
    const row=coordinates|(output<<BigInt(dimension))|(1n<<BigInt(dimension+width));
    queries++;
    if(addRow(pivots,row,rowWidth)){rank++;stagnant=0;}
    else stagnant++;
    if(queries>maxQueriesPerStage)return {ok:false,reason:'sample-cap',queries,rank,dimension,stagnant,stagnationLimit};
  }
  const relations=nullspace(pivots,rowWidth);
  const relation=relations.find(vector=>{
    const a=vector&inputMask;
    const w=(vector>>BigInt(dimension))&outputMask;
    return a!==0n&&w!==0n;
  });
  if(!relation)return {ok:false,reason:'no-nonconstant-relation',queries,rank,dimension,stagnant,stagnationLimit,nullity:relations.length};
  const a=relation&inputMask;
  const w=(relation>>BigInt(dimension))&outputMask;
  const c=(relation>>BigInt(dimension+width))&1n;
  const pivot=firstSetBit(a,dimension);
  const rhs=BigInt(parity(w&target))^c;
  return {ok:true,a,w,c,pivot,rhs,queries,rank,dimension,stagnant,stagnationLimit,nullity:relations.length};
}

/**
 * Randomized chosen-query inversion for permutations with the affine-flag
 * property and a declared coordinate degree bound D. The degree promise is
 * not certified. The returned candidate is always checked with the oracle.
 *
 * The stopping rule assumes independent uniform samples from each current
 * coset. The default seeded sampler is for reproducible experiments only;
 * inject a cryptographically secure sampler in a real attack.
 *
 * @param {(input:bigint)=>bigint} oracle
 * @param {bigint} target
 * @param {number} width
 * @param {number} degree
 * @param {{seed?:number,delta?:number,maxQueriesPerStage?:number,
 *   randomCoordinates?:(width:number)=>bigint}} [options]
 * @returns {{success:boolean,input:bigint|null,queries:number,stages:object[],verified:boolean,reason:string|null,failedDimension?:number}}
 */
function invertByRandomAffineGraph(oracle,target,width,degree,options={}) {
  if(!Number.isInteger(width)||width<2||width>64||!Number.isInteger(degree)||degree<1||degree>width)throw new RangeError('width 2..64 and degree 1..width required');
  const delta=options.delta??1e-8;
  if(!(delta>0&&delta<1))throw new RangeError('delta must be between 0 and 1');
  const randomCoordinates=options.randomCoordinates??makeSeededRandomCoordinates(options.seed??1);
  const mask=(1n<<BigInt(width))-1n;
  target&=mask;
  let base=0n;
  let basis=Array.from({length:width},(_,i)=>1n<<BigInt(i));
  let queries=0;
  const stages=[];
  while(basis.length){
    const dimension=basis.length;
    const stageDelta=delta/width;
    const rowWidth=dimension+width+1;
    const logBudget=Math.log(1/stageDelta);
    const maxQueriesPerStage=options.maxQueriesPerStage??Math.ceil(8*(2**degree)*(rowWidth+logBudget));
    const result=findRelation(oracle,target,base,basis,width,degree,randomCoordinates,stageDelta,maxQueriesPerStage);
    queries+=result.queries;
    stages.push({
      dimension,
      queries:result.queries,
      rank:result.rank,
      nullity:result.nullity,
      stagnationLimit:result.stagnationLimit,
      reason:result.reason??'affine-relation'
    });
    if(!result.ok)return {...result,success:false,input:null,queries,stages,verified:false,failedDimension:dimension};
    const pivotVector=basis[result.pivot];
    if(result.rhs)base^=pivotVector;
    const nextBasis=[];
    for(let i=0;i<basis.length;i++){
      if(i!==result.pivot)nextBasis.push(basis[i]^(((result.a>>BigInt(i))&1n)?pivotVector:0n));
    }
    basis=nextBasis;
  }
  const verified=oracle(base)===target;
  queries++;
  return {success:verified,input:verified?base:null,queries,stages,verified,reason:verified?null:'final-verification-failed'};
}

/** @param {number} width @param {(width:number)=>bigint} randomCoordinates @returns {bigint} */
function randomWord(width,randomCoordinates) {
  return randomCoordinates(width);
}

/** @param {number} n @param {number} degree @returns {number} */
function binomialSum(n,degree) {
  let total=0;
  for(let j=0;j<=Math.min(n,degree);j++){
    let coefficient=1;
    for(let k=1;k<=j;k++)coefficient=coefficient*(n-k+1)/k;
    total+=Math.round(coefficient);
  }
  return total;
}

module.exports={makeSeededRandomCoordinates,makeRandomTriangularOracle,
  invertByRandomAffineGraph,randomWord,binomialSum,applyLinear};
