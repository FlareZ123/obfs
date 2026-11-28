'use strict';

const {randomInt}=require('node:crypto');

/** @typedef {(input:number)=>number} UIntOracle */
/** @typedef {{bits:number,rankBound:number,maxOrbitCalls?:number,completion?:'deterministic'|'sampled-residual',sample?:()=>number,maxSamples?:number}} BatchOptions */
/** @typedef {{preimage:number,newOracleCalls:number,cycleScanned:boolean,cycleSteps:number}} BatchTargetReceipt */
/** @typedef {{bits:number,rankBound:number,interpolantNullity:number,orbitCap:number,setupCalls:number,totalCalls:number,scannedCycles:number,cacheHits:number,targets:number,knownOutputs:number,completion:string,samplingCalls:number}} BatchStatistics */
/**
 * @typedef {{
 *   invert:(target:number)=>BatchTargetReceipt,
 *   stats:()=>BatchStatistics
 * }} BatchInverter
 */

/**
 * Insert a GF(2) vector into an echelon basis when independent.
 * @param {number[]} pivots
 * @param {number} original
 * @param {number} bits
 * @returns {boolean}
 */
function extendBasis(pivots,original,bits) {
  let value=original>>>0;
  for(let bit=bits-1;bit>=0;bit--) {
    if(((value>>>bit)&1)===0)continue;
    if(pivots[bit]!==0)value=(value^pivots[bit])>>>0;
    else {pivots[bit]=value;return true;}
  }
  return false;
}

/**
 * Compute inverse of a nonsingular binary matrix represented by columns.
 * @param {number[]} columns
 * @returns {number[]}
 */
function inverseColumns(columns) {
  const bits=columns.length;
  /** @type {{left:number,right:number}[]} */
  const rows=[];
  for(let row=0;row<bits;row++) {
    let left=0;
    for(let col=0;col<bits;col++)if((columns[col]>>>row)&1)
      left=(left^(1<<col))>>>0;
    rows.push({left,right:(1<<row)>>>0});
  }
  for(let bit=0;bit<bits;bit++) {
    let pivot=bit;
    while(pivot<bits&&!((rows[pivot].left>>>bit)&1))pivot++;
    if(pivot===bits)throw new TypeError('Affine completion was singular');
    [rows[bit],rows[pivot]]=[rows[pivot],rows[bit]];
    for(let row=0;row<bits;row++) {
      if(row!==bit&&((rows[row].left>>>bit)&1)) {
        rows[row].left=(rows[row].left^rows[bit].left)>>>0;
        rows[row].right=(rows[row].right^rows[bit].right)>>>0;
      }
    }
  }
  return Array.from({length:bits},(_,col)=>{
    let image=0;
    for(let row=0;row<bits;row++)if((rows[row].right>>>col)&1)
      image=(image^(1<<row))>>>0;
    return image>>>0;
  });
}

/**
 * Apply a GF(2) linear map whose columns are unsigned bit vectors.
 * @param {number[]} columns
 * @param {number} input
 * @returns {number}
 */
function applyColumns(columns,input) {
  let image=0;
  for(let bit=0;bit<columns.length;bit++)if((input>>>bit)&1)
    image=(image^columns[bit])>>>0;
  return image>>>0;
}

/**
 * Build a batched exact **forward-oracle** inverter for a fixed deterministic
 * permutation of GF(2)^n whose public affine-residual output span has rank
 * at most rankBound. The promise is not certifiable from its setup queries.
 *
 * As in the established deterministic affine-completion theorem, n+1
 * interpolation queries produce M with nullity d<=r. Change exactly d
 * columns to make H invertible. Then phi(x)=H^-1(F(x)^F(0)) differs from x
 * only inside a fixed unknown subspace U of dimension at most r+d.
 *
 * The extra batch observation is simple but powerful: an explored phi
 * cycle gives the preimage for EVERY output of that cycle, not only the
 * requested target. Cache all forward calls and index their output-to-input
 * map, so later targets from a visited cycle cost **zero** new calls.
 * For a batch whose normalized targets occupy C U-cosets, the entire batch
 * uses at most n+1+C*2^min(n,r+d) distinct forward calls, regardless of
 * the number of supplied targets. Neither U nor the coset labels need to be
 * known to the attacker; C is an analysis-side parameter.
 *
 * A second, optional 'sampled-residual' completion uses residual vectors
 * D(x)=F(x)^F(0)^Mx drawn from a uniformly random input oracle. Because
 * F is bijective, their quotient classes are uniform and span the d missing
 * dimensions after fewer than d+1.607 draws in expectation. Those d
 * completion vectors lie in the true residual output span R, so the cycle
 * dimension drops from r+d to r. With C target R-cosets, the uncapped
 * random-sampling model has expected total query cost below
 * n+1+d+1.607+C*2^r. A finite maxSamples cap reports failure explicitly;
 * the statistical bound applies only to fresh uniform draws, not an
 * attacker-supplied deterministic test sample sequence.
 *
 * This is a chosen-oracle attacker, not an obfuscator or a proof of source
 * recovery. In particular, the cache must NOT be reused with nondeterministic,
 * stateful, nonce-dependent, or account-sensitive endpoints.
 *
 * @param {UIntOracle} oracle
 * @param {BatchOptions} options
 * @returns {BatchInverter}
 */
function prepareLowRankBatchInverter(oracle,options) {
  const {bits,rankBound,completion='deterministic'}=options;
  if(completion!=='deterministic'&&completion!=='sampled-residual')
    throw new RangeError('Unknown affine completion strategy');
  if(!Number.isSafeInteger(bits)||bits<1||bits>32||
      !Number.isSafeInteger(rankBound)||rankBound<0||
      rankBound>Math.min(16,bits))
    throw new RangeError('Expected 1..32 bits and rankBound 0..min(16,bits)');
  const range=2**bits;
  /** @type {Map<number,number>} */
  const valueByInput=new Map();
  /** @type {Map<number,number>} */
  const inputByValue=new Map();
  /** @param {number} input @returns {number} */
  function query(input) {
    const key=input>>>0;
    if(valueByInput.has(key))return /** @type {number} */(valueByInput.get(key));
    const output=oracle(key);
    if(!Number.isSafeInteger(output)||output<0||output>=range)
      throw new TypeError('Oracle returned a value outside n-bit domain');
    const value=output>>>0;
    const collision=inputByValue.get(value);
    if(collision!==undefined&&collision!==key)
      throw new TypeError('Oracle is not injective on observed inputs');
    valueByInput.set(key,value);
    inputByValue.set(value,key);
    return value;
  }
  const constant=query(0);
  const columns=Array.from({length:bits},(_,bit)=>
    (query((1<<bit)>>>0)^constant)>>>0);
  const pivots=Array(bits).fill(0);
  /** @type {number[]} */
  const free=[];
  for(let bit=0;bit<bits;bit++) {
    if(!extendBasis(pivots,columns[bit],bits))free.push(bit);
  }
  const nullity=free.length;
  if(nullity>rankBound)
    throw new RangeError('Oracle interpolant exceeds rank promise');
  const completed=columns.slice();
  let samplingCalls=0;
  if(completion==='sampled-residual') {
    const sample=options.sample??(()=>randomInt(range));
    const maxSamples=options.maxSamples??(bits+64);
    if(!Number.isSafeInteger(maxSamples)||maxSamples<0)
      throw new RangeError('Invalid residual sampling cap');
    /** @type {number[]} */
    const directions=[];
    while(directions.length<nullity) {
      if(samplingCalls>=maxSamples)
        throw new RangeError('Uniform residual-completion samples exhausted');
      const input=sample();
      if(!Number.isSafeInteger(input)||input<0||input>=range)
        throw new RangeError('Sample outside n-bit domain');
      const residual=(query(input)^constant^applyColumns(columns,input))>>>0;
      samplingCalls++;
      if(extendBasis(pivots,residual,bits))directions.push(residual);
    }
    for(let i=0;i<free.length;i++)
      completed[free[i]]=(completed[free[i]]^directions[i])>>>0;
  } else {
    for(const index of free) {
      let filled=false;
      for(let bit=0;bit<bits;bit++){
        const direction=(1<<bit)>>>0;
        if(extendBasis(pivots,direction,bits)) {
          completed[index]=(completed[index]^direction)>>>0;
          filled=true;
          break;
        }
      }
      if(!filled)throw new TypeError('Failed to complete interpolant');
    }
  }
  const inverse=inverseColumns(completed);
  const orbitBound=2**Math.min(bits,rankBound+
    (completion==='sampled-residual'?0:nullity));
  const maxOrbitCalls=options.maxOrbitCalls??Math.min(65536,orbitBound);
  if(!Number.isSafeInteger(maxOrbitCalls)||maxOrbitCalls<1||
      maxOrbitCalls>orbitBound)
    throw new RangeError('Invalid orbit cap');
  const setupCalls=valueByInput.size;
  let scannedCycles=0,cacheHits=0,targets=0;

  /** @param {number} target @returns {BatchTargetReceipt} */
  function invert(target) {
    if(!Number.isSafeInteger(target)||target<0||target>=range)
      throw new RangeError('Target outside n-bit domain');
    targets++;
    const cached=inputByValue.get(target>>>0);
    if(cached!==undefined) {
      cacheHits++;
      return {preimage:cached,newOracleCalls:0,cycleScanned:false,cycleSteps:0};
    }
    const before=valueByInput.size;
    const wanted=applyColumns(inverse,(target^constant)>>>0);
    let current=wanted;
    for(let step=1;step<=maxOrbitCalls;step++) {
      const image=query(current);
      const next=applyColumns(inverse,(image^constant)>>>0);
      if(next===wanted){
        scannedCycles++;
        const preimage=inputByValue.get(target>>>0);
        if(preimage===undefined)
          throw new RangeError('Non-permutation or falsified rank promise');
        return {
          preimage,newOracleCalls:valueByInput.size-before,
          cycleScanned:true,cycleSteps:step
        };
      }
      current=next;
    }
    throw new RangeError('Orbit cap or rank promise exhausted');
  }
  /** @returns {BatchStatistics} */
  function stats() {
    return {bits,rankBound,interpolantNullity:nullity,orbitCap:orbitBound,
      setupCalls,totalCalls:valueByInput.size,scannedCycles,cacheHits,targets,
      knownOutputs:inputByValue.size,completion,samplingCalls};
  }
  return {invert,stats};
}

module.exports={prepareLowRankBatchInverter};
