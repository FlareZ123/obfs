'use strict';

const {dropCoordinate}=require('./bounded-degree-symbolic-affine-inverse');

/** @param {number} seed @returns {()=>number} */
function xorShift32(seed) {
  let state=(seed>>>0)||0x9e3779b9;
  return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
}

/** @param {number} value @returns {number} */
function highestBit(value) {
  return 31-Math.clz32(value>>>0);
}

/**
 * Insert an unsigned zero coordinate at pivot position.
 * The high bit pivot=31 corner does not shift by 32 (JS wraps it).
 * @param {number} value
 * @param {number} pivot
 * @returns {number}
 */
function insertZeroBit(value,pivot) {
  const lower=(value&(2**pivot-1))>>>0;
  const higher=pivot===31?0:value>>>pivot;
  return (lower|(higher<<(pivot+1)))>>>0;
}

/**
 * An unknown affine-wrapped compatible permutation ALWAYS has a nonzero
 * hidden constant differential: F(x xor d)=F(x) xor e for every x.
 * Taking the highest hidden coordinate, the input difference is
 * d=A_in^{-1}(2^(n-1)) and the output difference is
 * e=linear(A_out)(2^(n-1)). Both are nonzero even if the middle compatible
 * permutation has arbitrary high Boolean degree.
 *
 * This routine is a *heuristic* candidate finder, NOT a worst-case
 * guaranteed structural extractor. Fix nonzero public a=1. The derivative
 * D_aF(x)=F(x xor a) xor F(x) is invariant along d. Chosen x with low bit
 * zero avoid the automatic x↔x xor a duplicate and collisions may yield
 * h=d or h=d xor a. Check both with sampled independent differences.
 *
 * Crucially, an adversarial sparse rare-prefix gate can make FALSE input
 * directions look constant to any bounded sample. No finite sampling
 * count less than exhaustive traversal is a certificate of global
 * linear structure against arbitrary permutations.
 *
 * @param {(input:number)=>number} oracle n-bit permutation forward oracle
 * @param {number} bits 2..32
 * @param {{seed?:number,maxSamples?:number,confirmationTrials?:number,
 *   exhaustiveAtOrBelow?:number}} [options]
 * @returns {{inputDirection:number,outputDifference:number,
 *   samples:number,distinctQueries:number,verifiedChecks:number,
 *   exact:boolean}|null}
 */
function findCandidateAffineStructure(oracle,bits,options={}) {
  if(typeof oracle!=='function'||!Number.isInteger(bits)||bits<2||bits>32)
    throw new RangeError('Expected a 2..32-bit forward permutation oracle');
  const maxSamples=options.maxSamples??Math.min(220000,Math.ceil(5*2**(bits/2)));
  const confirmationTrials=options.confirmationTrials??40;
  const exhaustiveAtOrBelow=options.exhaustiveAtOrBelow??11;
  if(!Number.isInteger(maxSamples)||maxSamples<1||
     !Number.isInteger(confirmationTrials)||confirmationTrials<1||
     !Number.isInteger(exhaustiveAtOrBelow)||exhaustiveAtOrBelow<0||
     exhaustiveAtOrBelow>12)
    throw new RangeError('Expected positive sample and confirmation budgets');
  const mask=bits===32?0xffffffff:(2**bits-1)>>>0;
  const next=xorShift32(options.seed??(0xb72ce14d^bits));
  const observed=new Map();
  /** @param {number} x @returns {number} */
  function F(x) {
    const key=(x&mask)>>>0;
    if(observed.has(key))return /** @type {number} */(observed.get(key));
    const value=oracle(key);
    if(!Number.isSafeInteger(value)||value<0||value>mask)
      throw new TypeError('Forward oracle returned an out-of-range word');
    observed.set(key,value>>>0);
    return value>>>0;
  }
  /** @type {Map<number,number>} */
  const derivatives=new Map();
  const seen=new Set();
  const domainHalf=2**(bits-1);
  const available=Math.min(domainHalf,maxSamples);
  let trials=0;
  while(seen.size<available && trials<available*12) {
    trials++;
    const input=((next()&(domainHalf-1))<<1)>>>0;
    if(seen.has(input))continue;
    seen.add(input);
    const derivative=(F(input)^F(input^1))>>>0;
    const previous=derivatives.get(derivative);
    if(previous===undefined) {
      derivatives.set(derivative,input);
      continue;
    }
    const difference=(input^previous)>>>0;
    for(const candidate of [difference,(difference^1)>>>0]) {
      if(candidate===0||candidate>mask)continue;
      const outputDifference=(F(0)^F(candidate))>>>0;
      if(!outputDifference)continue;
      let valid=true,checked=0;
      if(bits<=exhaustiveAtOrBelow) {
        for(let x=0;x<2**bits;x++) {
          checked++;
          if(((F(x)^F(x^candidate))>>>0)!==outputDifference) {
            valid=false;break;
          }
        }
      }else {
        for(let j=0;j<confirmationTrials;j++) {
          const x=(next()&mask)>>>0;
          checked++;
          if(((F(x)^F(x^candidate))>>>0)!==outputDifference) {
            valid=false;break;
          }
        }
      }
      if(valid)return {
        inputDirection:candidate,outputDifference,
        samples:seen.size,distinctQueries:observed.size,
        verifiedChecks:checked,exact:bits<=exhaustiveAtOrBelow
      };
    }
  }
  return null;
}

/**
 * Experimental recursive chosen-oracle inverse for *generic-high-degree*
 * unknown two-sided affine-wrapped compatible permutations.
 *
 * If a true constant differential d/e is known, the quotient obtained
 * from input mod <d> and output mod <e> is a permutation. A top-hidden
 * bit of the claimed compatible form gives such a direction. The search
 * below heuristically recovers a differential candidate per quotient by
 * colliding a chosen first derivative. It is NOT established that
 * quotienting by an arbitrary verified linear direction preserves hidden
 * triangular compatibility or that derivative collisions reveal the
 * required direction under adversarial sparse compatible functions.
 * Therefore this is a reproducible heuristic study, not a theorem or
 * general-purpose inverter. The final source-oracle equality check is
 * mandatory; null means no proof of inversion.
 *
 * @param {(input:number)=>number} oracle Forward permutation oracle
 * @param {number} target Unsigned target word
 * @param {number} bits Width 1..32
 * @param {{seed?:number,maxSamples?:number,confirmationTrials?:number,
 *   exhaustiveAtOrBelow?:number}} [options]
 * @returns {{input:number,oracleQueries:number,levels:number,
 *   sampledPeriods:number,exactConfirmedPeriods:number}|null}
 */
function invertViaHiddenStructureHeuristic(oracle,target,bits,options={}) {
  if(typeof oracle!=='function'||!Number.isInteger(bits)||bits<1||bits>32)
    throw new RangeError('Expected 1..32-bit target permutation oracle');
  const wordMask=bits===32?0xffffffff:(2**bits-1)>>>0;
  if(!Number.isSafeInteger(target)||target<0||target>wordMask)
    throw new RangeError('Target outside n-bit unsigned domain');
  const originalCache=new Map();
  /** @param {number} x @returns {number} */
  function original(x) {
    const key=(x&wordMask)>>>0;
    if(originalCache.has(key))
      return /** @type {number} */(originalCache.get(key));
    const result=oracle(key);
    if(!Number.isSafeInteger(result)||result<0||result>wordMask)
      throw new TypeError('Oracle returned an out-of-domain word');
    originalCache.set(key,result>>>0);
    return result>>>0;
  }
  let sampledPeriods=0,exactConfirmedPeriods=0,levels=0;
  /**
   * @param {(input:number)=>number} F
   * @param {number} y
   * @param {number} n
   * @returns {number|null}
   */
  function invert(F,y,n) {
    levels++;
    if(n===1) {
      if(F(0)===y)return 0;
      return F(1)===y?1:null;
    }
    const structure=findCandidateAffineStructure(F,n,{
      ...options,seed:((options.seed??0x7137c3ab)^Math.imul(n,0x9e3779b9))>>>0
    });
    if(!structure)return null;
    sampledPeriods++;
    if(structure.exact)exactConfirmedPeriods++;
    const d=structure.inputDirection,e=structure.outputDifference;
    const inputPivot=highestBit(d),outputPivot=highestBit(e);
    if(inputPivot<0||outputPivot<0)throw new Error('Structure has zero direction');
    const outputBit=(1<<outputPivot)>>>0;
    /** @param {number} input @returns {number} */
    function quotient(input) {
      const x=insertZeroBit(input,inputPivot);
      const actual=F(x);
      const normalized=(actual&outputBit)?actual^e:actual;
      return dropCoordinate(normalized,outputPivot);
    }
    const normalizedTarget=(y&outputBit)?y^e:y;
    const smallerTarget=dropCoordinate(normalizedTarget,outputPivot);
    const candidate=invert(quotient,smallerTarget,n-1);
    if(candidate===null)return null;
    const lifted=insertZeroBit(candidate,inputPivot);
    if(F(lifted)===y)return lifted;
    const other=(lifted^d)>>>0;
    if(F(other)===y)return other;
    return null;
  }
  const candidate=invert(original,target,bits);
  if(candidate===null||original(candidate)!==target)return null;
  return {
    input:candidate>>>0,oracleQueries:originalCache.size,
    levels,sampledPeriods,exactConfirmedPeriods
  };
}

module.exports={
  xorShift32,highestBit,insertZeroBit,
  findCandidateAffineStructure,invertViaHiddenStructureHeuristic
};
