'use strict';

/**
 * For j>=2, this is an n-bit compatible triangular permutation obtained by
 * toggling source-coordinate bit j on one selected j-bit lower prefix.
 * It is an exact one-bit involution, so every instance is bijective.
 *
 * This generator is used only by the defensive candidate-mask certifier
 * lower-bound test. It is not a general-purpose cryptographic primitive.
 *
 * @param {number} bits
 * @param {number} gateBit
 * @param {number} prefix
 * @returns {(input:number)=>number}
 */
function rarePrefixPermutation(bits,gateBit,prefix) {
  if(!Number.isInteger(bits)||bits<3||bits>32)
    throw new RangeError('bits must be in [3,32]');
  if(!Number.isInteger(gateBit)||gateBit<2||gateBit>=bits)
    throw new RangeError('gateBit must be in [2,bits-1]');
  const prefixes=2**gateBit;
  if(!Number.isInteger(prefix)||prefix<0||prefix>=prefixes)
    throw new RangeError('prefix must fit below gateBit');
  const inputMask=bits===32?0xffffffff:(2**bits)-1;
  const lowerMask=prefixes-1;
  const bit=(1<<gateBit)>>>0;
  return input=>{
    const x=input>>>0;
    return ((x^((x&lowerMask)===prefix?bit:0))&inputMask)>>>0;
  };
}

/** @typedef {{input:number,output:number}} QueryRecord */

/**
 * A fixed-cap adaptive black-box query program. Each next chosen input is
 * computed using the actual preceding oracle result, not from the hidden
 * rare prefix or the generator's internals.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} bits
 * @param {number} budget
 * @returns {QueryRecord[]}
 */
function adaptiveTranscript(oracle,bits,budget) {
  const mask=bits===32?0xffffffff:(2**bits)-1;
  let state=0x72;
  /** @type {QueryRecord[]} */
  const observations=[];
  for(let k=0;k<budget;k++) {
    const input=(state^(k*19))&mask;
    const output=oracle(input);
    observations.push({input,output});
    state=(Math.imul(output,5)+61+k)&mask;
  }
  return observations;
}

/**
 * Exact finite-width coupling check against all rare prefixes, with no
 * probabilistic approximation. The adaptive policy sees a public identity
 * oracle in its reference run, then is executed afresh against every
 * one-bit-gated source.
 *
 * For any prefix untouched on the identity transcript, all adaptive
 * responses stay identical by induction. If a prefix was touched, the
 * first such response must differ. We separately test a real nonconstant
 * scalar derivative and the permutation property for every source.
 *
 * @param {number} bits
 * @param {number} gateBit
 * @param {number} budget
 * @returns {{bits:number,gateBit:number,budget:number,prefixes:number,
 *   distinctProbedPrefixes:number,indistinguishable:number,
 *   distinguishable:number,bijections:number,nonAffineScalars:number}}
 */
function exactPrefixCensus(bits,gateBit,budget) {
  if(!Number.isSafeInteger(budget)||budget<0)
    throw new RangeError('budget must be a nonnegative safe integer');
  if(bits>12)throw new RangeError('Exhaustive replay is restricted to width <=12');
  const identity=/** @param {number} x */(x)=>x>>>0;
  const baseline=adaptiveTranscript(identity,bits,budget);
  const lowerMask=2**gateBit-1;
  const exposed=new Set(baseline.map(record=>record.input&lowerMask));
  const prefixes=2**gateBit;
  let indistinguishable=0,distinguishable=0,bijections=0,nonAffineScalars=0;

  for(let prefix=0;prefix<prefixes;prefix++) {
    const oracle=rarePrefixPermutation(bits,gateBit,prefix);
    const allOutputs=new Set();
    for(let x=0;x<2**bits;x++)allOutputs.add(oracle(x));
    if(allOutputs.size===2**bits)bijections++;
    const first=prefix,second=prefix^2;
    const firstDerivative=((oracle(first)^oracle(first^1))>>>gateBit)&1;
    const otherDerivative=((oracle(second)^oracle(second^1))>>>gateBit)&1;
    if(firstDerivative===1 && otherDerivative===0)nonAffineScalars++;
    const transcript=adaptiveTranscript(oracle,bits,budget);
    if(JSON.stringify(transcript)===JSON.stringify(baseline)) {
      indistinguishable++;
      if(exposed.has(prefix))
        throw new Error('A probed gate prefix must change its first oracle response');
    }else {
      distinguishable++;
      if(!exposed.has(prefix))
        throw new Error('An unprobed prefix cannot alter the adaptive transcript');
    }
  }
  return {
    bits,gateBit,budget,prefixes,
    distinctProbedPrefixes:exposed.size,
    indistinguishable,distinguishable,bijections,nonAffineScalars
  };
}

if(require.main===module) {
  process.stdout.write('RARE_PREFIX_CERTIFIER_CENSUS '+
    JSON.stringify(exactPrefixCensus(9,7,13))+'\n');
}

module.exports={rarePrefixPermutation,adaptiveTranscript,exactPrefixCensus};
