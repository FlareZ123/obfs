'use strict';

const {randomInt}=require('node:crypto');

/**
 * Fixed, deterministic GF(2) bitvector model. The source oracle is unavailable
 * after learning: evaluating this record requires only the table and n linear
 * input coordinates. All numbers are unsigned 32-bit words.
 *
 * @typedef {{bits:number,rank:number,table:number[],coordinates:number[],
 *   affineCorrections:number[],queries:number,attempts:number,
 *   verificationSamples:number,failureBound:number}} ProfileClone
 */

/**
 * Learn any fixed F(x)=b XOR A*x XOR g(V*x) on GF(2)^bits where rank(V)<=rank.
 * g is an arbitrary vector-valued truth table. No source, matrices, rank
 * basis, inversion oracle, or injectivity is supplied to the learner.
 *
 * A random rank-tuple of anchor vectors spans the hidden projection with
 * probability at least prod(i=0..rank-1)(1-2^(i-rank)). For full-span anchors,
 * comparing F(x+a)+F(x)+F(a)+F(0) against all anchor-cube differences reveals
 * each input basis vector's nonlinear coset. The remaining difference is
 * additive, yielding an exact source-independent offline model.
 *
 * A prematurely matched, deficient anchor set may produce a wrong model.
 * Both F and each candidate have algebraic degree<=rank. A nonzero
 * difference has uniform input mismatch probability >= 2^(-rank), by the
 * Reed-Muller minimum distance. Independently chosen held-out inputs veto
 * that model with a union-bound failure probability. Trial and verifier
 * sample counts allocate half the requested delta to each failure event.
 *
 * The probability statement assumes independent, uniform draws, a fixed
 * deterministic oracle and the promised input-rank family. A seeded test
 * reproduces observed behavior but does not prove that independence.
 *
 * @param {(input:number)=>number} oracle Fixed forward-only 32-bit word oracle
 * @param {number} bits Input width, 1..32
 * @param {number} rank Known upper bound on hidden input projection, 1..8
 * @param {()=>number} [draw] Independent uniform unsigned 32-bit draws
 * @param {number} [delta] Desired total upper failure probability
 * @returns {ProfileClone}
 */
function learnProjectedAffineOracle(
  oracle,bits,rank,draw=()=>randomInt(2**32),delta=1e-10
){
  if(!Number.isInteger(bits)||bits<1||bits>32||
     !Number.isInteger(rank)||rank<1||rank>8||rank>bits){
    throw new RangeError('Require 1..32 input bits and 1..min(8,bits) projection rank');
  }
  if(!Number.isFinite(delta)||delta<=0||delta>=1){
    throw new RangeError('delta must be strictly between zero and one');
  }
  const mask=bits===32?0xffffffff:2**bits-1;
  const count=2**rank;
  let fullRankProbability=1;
  for(let i=0;i<rank;i++)fullRankProbability*=1-2**(i-rank);
  const maxAttempts=Math.ceil(Math.log(delta/2)/Math.log1p(-fullRankProbability));
  const validationSamples=Math.ceil(
    Math.log(delta/(2*maxAttempts))/Math.log1p(-1/count)
  );
  const failureBound=Math.pow(1-fullRankProbability,maxAttempts)+
    maxAttempts*Math.pow(1-1/count,validationSamples);
  // Draw the verifier independently of subsequent, potentially adaptive
  // training choices. No verifier input is used to construct any candidate.
  const heldout=Array.from({length:validationSamples},()=>((draw()&mask)>>>0));
  /** @type {Map<number,number>} */
  const responses=new Map();
  /** @param {number} input @returns {number} */
  function ask(input){
    const x=(input&mask)>>>0;
    if(!responses.has(x))responses.set(x,oracle(x)>>>0);
    return /** @type {number} */ (responses.get(x));
  }

  for(let attempt=1;attempt<=maxAttempts;attempt++){
    const anchors=Array.from({length:rank},()=>((draw()&mask)>>>0));
    const corners=Array(count).fill(0);
    for(let s=1;s<count;s++){
      const low=s&-s;
      corners[s]=(corners[s^low]^anchors[31-Math.clz32(low)])>>>0;
    }
    const table=corners.map(ask);
    const f0=table[0];
    const profiles=Array.from({length:count},(_,s)=>
      Array.from({length:count},(_,t)=>
        (table[s^t]^table[s]^table[t]^f0)>>>0
      )
    );
    /** @type {number[]} */
    const coordinates=[];
    /** @type {number[]} */
    const affineCorrections=[];
    for(let i=0;i<bits;i++){
      const e=(1<<i)>>>0;
      const fe=ask(e);
      let viable=Array.from({length:count},(_,s)=>s);
      for(let t=1;t<count && viable.length;t++){
        const observed=(ask(e^corners[t])^fe^table[t]^f0)>>>0;
        viable=viable.filter(s=>profiles[s][t]===observed);
      }
      if(!viable.length)break;
      const s=viable[0];
      coordinates.push(s);
      affineCorrections.push((fe^table[s])>>>0);
    }
    if(coordinates.length!==bits)continue;
    const candidate={bits,rank,table,coordinates,affineCorrections};
    if(heldout.every(x=>evaluateProjectedAffineModel(candidate,x)===ask(x))){
      return {...candidate,queries:responses.size,attempts,
        verificationSamples,failureBound};
    }
  }
  throw new Error('No verified rank-bounded projected affine model within the predeclared query cap');
}

/**
 * Offline evaluation of the learned function; no call to its source oracle.
 * @param {Pick<ProfileClone,'bits'|'rank'|'table'|'coordinates'|'affineCorrections'>} model
 * @param {number} input
 * @returns {number}
 */
function evaluateProjectedAffineModel(model,input){
  const mask=model.bits===32?0xffffffff:2**model.bits-1;
  let x=(input&mask)>>>0;
  let index=0;
  let affine=0;
  while(x){
    const low=x&-x;
    const i=31-Math.clz32(low);
    index^=model.coordinates[i];
    affine^=model.affineCorrections[i];
    x=(x^low)>>>0;
  }
  return (model.table[index]^affine)>>>0;
}

module.exports={learnProjectedAffineOracle,evaluateProjectedAffineModel};
