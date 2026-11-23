'use strict';

/** @typedef {(input:number)=>number} Oracle */
/** @typedef {{mask:number,direction:number,secondDifferenceRank:number}} FlagStep */
/** @typedef {{input:number,verified:boolean,newQueries:number,queries:number}} InverseResult */
/** @typedef {{status:'calibrated',steps:FlagStep[],trainingQueries:number,queries:()=>number,invert:(target:number)=>InverseResult}} LearnedFlag */
/** @typedef {{status:'unsupported',stage:number,queries:number,secondDifferenceRank:number}} UnsupportedFlag */

/** @param {number} value @returns {0|1} */
function parity(value) {
  let x=value>>>0;
  x^=x>>>16;
  x^=x>>>8;
  x^=x>>>4;
  return /** @type {0|1} */ ((0x6996>>>(x&15))&1);
}

/** @param {number} bits @returns {number} */
function bitMask(bits) {
  return bits===32?0xffffffff:((2**bits)-1)>>>0;
}

/**
 * Reproducible sampling only. It makes no cryptographic-uniformity claim.
 * @param {number} seed
 * @returns {()=>number}
 */
function sampler(seed) {
  let state=(seed>>>0)||0x9e3779b9;
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  };
}

/**
 * Incrementally eliminate a nonzero GF(2) vector by highest set bit.
 * @param {Uint32Array} rows
 * @param {number} value
 * @param {number} bits
 * @returns {void}
 */
function includeRow(rows,value,bits) {
  let v=value>>>0;
  for(let j=bits-1;j>=0;j--) {
    if(!((v>>>j)&1))continue;
    if(rows[j])v=(v^rows[j])>>>0;
    else {rows[j]=v;return;}
  }
}

/**
 * Construct a basis of output masks orthogonal to every sampled second
 * difference. No hidden source, original affine basis or inverse is used.
 * @param {Uint32Array} rows
 * @param {number} bits
 * @returns {number[]}
 */
function annihilatorBasis(rows,bits) {
  /** @type {number[]} */
  const masks=[];
  for(let free=0;free<bits;free++) {
    if(rows[free])continue;
    let mask=(1<<free)>>>0;
    for(let pivot=0;pivot<bits;pivot++) {
      if(rows[pivot] && parity(rows[pivot]&mask))
        mask=(mask^(1<<pivot))>>>0;
    }
    masks.push(mask);
  }
  return masks;
}

/**
 * Chosen-query heuristic for learning a linear input/output flag of a
 * permutation. The attacker receives only a numeric forward oracle and a
 * public bit width; the hidden permutation and its affine wrappers remain
 * absent from this module.
 *
 * At stage k, choose an output mask w whose first derivative along every
 * current input-subspace basis direction is empirically constant. If its
 * restriction is a nonzero linear form on that subspace, retain the direction
 * that toggles it and shrink the subspace by the form's kernel. Unseen inputs
 * can violate a sampled condition. The final inverse therefore always uses
 * an independent exact oracle equality check and exposes verified=false.
 *
 * @param {Oracle} rawOracle
 * @param {{bits?:number,samplesPerStage?:number,sampleSeed?:number,
 *   maxQueries?:number}} [options]
 * @returns {LearnedFlag|UnsupportedFlag}
 */
function learnFlag(rawOracle,options={}) {
  const bits=options.bits??32;
  const samplesPerStage=options.samplesPerStage??16;
  const maxQueries=options.maxQueries??1000000;
  if(!Number.isInteger(bits)||bits<1||bits>32)
    throw new RangeError('bits must be between 1 and 32');
  if(!Number.isInteger(samplesPerStage)||samplesPerStage<1)
    throw new RangeError('samplesPerStage must be a positive integer');
  if(!Number.isInteger(maxQueries)||maxQueries<1)
    throw new RangeError('maxQueries must be positive');

  const limit=bitMask(bits);
  const next=sampler(options.sampleSeed??0x81e5a7d1);
  /** @type {Map<number,number>} */
  const cache=new Map();

  /** @param {number} input @returns {number} */
  function query(input) {
    const key=input>>>0;
    const cached=cache.get(key);
    if(cached!==undefined)return cached;
    if(cache.size>=maxQueries)throw new RangeError('Chosen-query cap exceeded');
    const value=rawOracle(key);
    if(!Number.isSafeInteger(value)||value<0||value>limit)
      throw new TypeError('Oracle output must be an unsigned value of declared width');
    const output=value>>>0;
    cache.set(key,output);
    return output;
  }

  /** @type {number[]} */
  let directions=Array.from({length:bits},(_,i)=>(1<<i)>>>0);
  /** @type {FlagStep[]} */
  const steps=[];
  const zero=query(0);

  for(let stage=0;stage<bits;stage++) {
    const firstDerivatives=directions.map(h=>(query(h)^zero)>>>0);
    const rows=new Uint32Array(bits);

    for(let sample=0;sample<samplesPerStage;sample++) {
      const x=(next()&limit)>>>0;
      const atX=query(x);
      for(let i=0;i<directions.length;i++) {
        const second=(query((x^directions[i])>>>0)^atX^firstDerivatives[i])>>>0;
        includeRow(rows,second,bits);
      }
    }

    const candidates=annihilatorBasis(rows,bits);
    let chosen=0;
    let pivot=-1;
    for(const mask of candidates) {
      for(let i=0;i<directions.length;i++) {
        if(parity(mask&firstDerivatives[i])) {
          chosen=mask;
          pivot=i;
          break;
        }
      }
      if(pivot!==-1)break;
    }
    if(pivot<0)return {
      status:'unsupported',
      stage,queries:cache.size,secondDifferenceRank:bits-candidates.length
    };

    const direction=directions[pivot];
    /** @type {number[]} */
    const nextDirections=[];
    for(let i=0;i<directions.length;i++) {
      if(i===pivot)continue;
      const correction=parity(chosen&firstDerivatives[i])?direction:0;
      nextDirections.push((directions[i]^correction)>>>0);
    }
    steps.push({
      mask:chosen,direction,secondDifferenceRank:bits-candidates.length
    });
    directions=nextDirections;
  }

  const trainingQueries=cache.size;
  return {
    status:'calibrated',
    steps,
    trainingQueries,
    queries:()=>cache.size,
    /** @param {number} target @returns {InverseResult} */
    invert(target) {
      if(!Number.isSafeInteger(target)||target<0||target>limit)
        throw new RangeError('Target must fit the calibrated bit width');
      const before=cache.size;
      let input=0;
      for(const step of steps) {
        if(parity(query(input)&step.mask)!==parity(target&step.mask))
          input=(input^step.direction)>>>0;
      }
      const verified=query(input)===target;
      return {input,verified,newQueries:cache.size-before,queries:cache.size};
    }
  };
}

module.exports={learnFlag,parity};
