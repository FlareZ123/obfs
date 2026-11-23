'use strict';

/**
 * Reproducible finite-width witness for an information-theoretic limit on
 * certifying global Boolean ANF degree of an *arbitrary* n-bit permutation.
 *
 * Suppose a deterministic chosen-input certifier accepts the identity F(x)=x
 * after q distinct forward queries, q <= 2^n-2. Select any two still-unseen
 * distinct inputs u,v, and construct a second oracle G by exchanging the
 * identity's outputs exactly at u,v.
 *
 *   G(x) = x xor ((u xor v)*(1_{x=u} xor 1_{x=v}))
 *
 * (vector-scalar multiplication is over GF(2)). G is a permutation and it
 * produces the exact same adaptive transcript by induction. However the
 * indicator difference 1_u xor 1_v has Boolean ANF degree exactly n-1.
 * The top n-degree coefficient cancels; in degree n-1, its coefficients
 * equal the nonzero coordinate differences (u xor v). Thus some coordinate
 * of G has algebraic degree n-1, whereas identity has degree one.
 *
 * Consequently for n>=3 and 1<=D<=n-2, no deterministic exact black-box
 * algorithm can certify "degree <= D" among arbitrary n-bit permutations
 * in fewer than 2^n-1 distinct forward queries in the worst case.
 * The upper bound is tight: 2^n-1 outputs uniquely determine the final
 * missing output from the permutation promise, allowing reconstruction
 * of its entire truth table and Boolean Mobius inversion.
 *
 * This is NOT a bound on finding a preimage under the extra, externally
 * given degree-D and affine-triangular promises. It is a bound on proving
 * the degree premise solely by untrusted black-box observations.
 */

/** @param {number} x @returns {number} */
function popcount(x) {
  let n=0;
  while(x){x&=x-1;n++;}
  return n;
}

/**
 * A deterministic *adaptive* observer. The next candidate depends on
 * the last response; seen inputs are skipped until a distinct input
 * is selected. Query caps are chosen to leave at least two inputs untested.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} bits
 * @param {number} count
 * @returns {{input:number,output:number}[]}
 */
function adaptivePermutationTranscript(oracle,bits,count) {
  if(!Number.isInteger(bits)||bits<3||bits>12||
     !Number.isInteger(count)||count<0||count>2**bits-2) {
    throw new RangeError('Expected bits 3..12 and at most 2^bits-2 queries');
  }
  const mask=2**bits-1;
  const seen=new Set();
  /** @type {{input:number,output:number}[]} */
  const transcript=[];
  let state=0x35a17&mask;
  for(let k=0;k<count;k++) {
    let input=(state^Math.imul(k+1,0x9e3779b9))&mask;
    while(seen.has(input))input=(input+1)&mask;
    seen.add(input);
    const output=oracle(input);
    if(!Number.isInteger(output)||output<0||output>mask)
      throw new TypeError('Expected an unsigned n-bit oracle output');
    transcript.push({input,output});
    state=(state+Math.imul(output+1,13)+Math.imul(k+1,31))&mask;
  }
  return transcript;
}

/**
 * Exact degree of a finite-width n-bit vector truth table.
 * @param {(input:number)=>number} oracle
 * @param {number} bits
 * @returns {number}
 */
function exactVectorAnfDegree(oracle,bits) {
  if(!Number.isInteger(bits)||bits<1||bits>12)
    throw new RangeError('Exhaustive ANF check is limited to bits<=12');
  const length=2**bits,mask=length-1;
  const coefficients=Array.from({length},(_,i)=>{
    const out=oracle(i);
    if(!Number.isInteger(out)||out<0||out>mask)
      throw new TypeError('Expected a complete n-bit vector function');
    return out;
  });
  for(let bit=0;bit<bits;bit++) {
    for(let monomial=0;monomial<length;monomial++) {
      if(monomial&(1<<bit))
        coefficients[monomial]^=coefficients[monomial^(1<<bit)];
    }
  }
  let maximum=0;
  for(let monomial=0;monomial<length;monomial++) {
    if(coefficients[monomial])
      maximum=Math.max(maximum,popcount(monomial));
  }
  return maximum;
}

/**
 * Swap two outputs of the identity oracle, keeping a genuine permutation.
 * @param {number} first
 * @param {number} second
 * @returns {(input:number)=>number}
 */
function swapIdentityOutputs(first,second) {
  if(!Number.isSafeInteger(first)||!Number.isSafeInteger(second)||first===second)
    throw new RangeError('Swap requires distinct unsigned inputs');
  return input=>input===first?second:input===second?first:input;
}

/**
 * Construct a hidden two-output swap AFTER executing a chosen adaptive
 * transcript on the identity. The exact swap endpoints are never queried
 * by that observer. Re-running the same observer against the swapped
 * permutation must produce a byte-identical response transcript, even
 * though the algebraic degree changes from 1 to bits-1.
 *
 * @param {number} bits
 * @param {number} count
 * @returns {{bits:number,count:number,unseen:number,swap:number[],
 *   transcriptEqual:boolean,referenceDegree:number,alternateDegree:number,
 *   identityBijection:boolean,alternateBijection:boolean}}
 */
function hiddenSwapDegreeWitness(bits,count) {
  /** @param {number} x @returns {number} */
  const reference=x=>x;
  const baseline=adaptivePermutationTranscript(reference,bits,count);
  const seen=new Set(baseline.map(record=>record.input));
  /** @type {number[]} */
  const unseen=[];
  for(let x=0;x<2**bits;x++)if(!seen.has(x))unseen.push(x);
  if(unseen.length<2)throw new Error('Cannot hide a two-point permutation swap');
  const swap=[unseen[0],unseen[unseen.length-1]];
  const alternate=swapIdentityOutputs(swap[0],swap[1]);
  const comparison=adaptivePermutationTranscript(alternate,bits,count);
  const transcriptEqual=JSON.stringify(baseline)===JSON.stringify(comparison);
  if(!transcriptEqual)throw new Error('Adaptive transcript differed despite hidden swap');

  const referenceDegree=exactVectorAnfDegree(reference,bits);
  const alternateDegree=exactVectorAnfDegree(alternate,bits);
  const identityBijection=new Set(Array.from({length:2**bits},(_,i)=>reference(i))).size===2**bits;
  const alternateBijection=new Set(Array.from({length:2**bits},(_,i)=>alternate(i))).size===2**bits;
  return {
    bits,count,unseen:unseen.length,swap,transcriptEqual,
    referenceDegree,alternateDegree,identityBijection,alternateBijection
  };
}

module.exports={
  adaptivePermutationTranscript,exactVectorAnfDegree,swapIdentityOutputs,
  hiddenSwapDegreeWitness
};

if(require.main===module) {
  process.stdout.write('PERMUTATION_DEGREE_CERTIFICATE_LOWER_BOUND '+
    JSON.stringify(hiddenSwapDegreeWitness(10,2**10-2))+'\n');
}
