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


/**
 * A known-coordinate compatible high-bit gate. This toggles the highest
 * coordinate if and only if the lower (n-1) input coordinates equal prefix.
 * It is a bijective compatible/triangular permutation: the lower outputs
 * equal the lower inputs, and the top output is its input bit XOR a scalar
 * of the lower coordinates. Its degree is exactly n-1.
 *
 * @param {number} bits 3..12
 * @param {number} prefix 0..2^(bits-1)-1
 * @returns {(input:number)=>number}
 */
function compatibleHighestBitGate(bits,prefix) {
  if(!Number.isInteger(bits)||bits<3||bits>12||
     !Number.isInteger(prefix)||prefix<0||prefix>=2**(bits-1))
    throw new RangeError('Expected 3..12 bits and one lower-bit prefix');
  const high=2**(bits-1),lowMask=high-1;
  return input=>((input&lowMask)===prefix?input^high:input)>>>0;
}

/**
 * A tight hidden gate witness against an adaptive certifier in the class
 * of known-coordinate compatible permutations. With fewer than 2^(n-1)
 * distinct input queries, at least one lower (n-1)-bit prefix is unseen;
 * choose that prefix after running the reference identity transcript.
 * All adaptive answers remain unchanged, but the compatible rare gate
 * has algebraic degree n-1 rather than one.
 *
 * This does NOT give the same bound when an unknown outer affine map is
 * applied: then the coordinate prefix and parity order are hidden.
 *
 * @param {number} bits
 * @param {number} count
 * @returns {{bits:number,count:number,prefixes:number,
 *   unseenPrefixes:number,chosenPrefix:number,transcriptEqual:boolean,
 *   referenceDegree:number,alternateDegree:number,
 *   alternateBijection:boolean}}
 */
function compatibleDegreeWitness(bits,count) {
  if(!Number.isInteger(bits)||bits<3||bits>12||
     !Number.isInteger(count)||count<0||count>=2**(bits-1))
    throw new RangeError('Expected fewer than 2^(bits-1) prefix queries');
  /** @param {number} x @returns {number} */
  const reference=x=>x;
  const baseline=adaptivePermutationTranscript(reference,bits,count);
  const high=2**(bits-1);
  const touched=new Set(baseline.map(record=>record.input&(high-1)));
  let chosenPrefix=-1;
  for(let prefix=0;prefix<high;prefix++) {
    if(!touched.has(prefix)){chosenPrefix=prefix;break;}
  }
  if(chosenPrefix<0)throw new Error('Pigeonhole hidden prefix did not exist');
  const alternate=compatibleHighestBitGate(bits,chosenPrefix);
  const replay=adaptivePermutationTranscript(alternate,bits,count);
  const transcriptEqual=JSON.stringify(replay)===JSON.stringify(baseline);
  if(!transcriptEqual)throw new Error('Unprobed compatible gate changed transcript');
  const alternateBijection=new Set(
    Array.from({length:2**bits},(_,i)=>alternate(i))
  ).size===2**bits;
  return {
    bits,count,prefixes:high,unseenPrefixes:high-touched.size,
    chosenPrefix,transcriptEqual,referenceDegree:exactVectorAnfDegree(reference,bits),
    alternateDegree:exactVectorAnfDegree(alternate,bits),alternateBijection
  };
}

/**
 * Reconstruct a compatible permutation from exactly one output per
 * (n-1)-bit prefix. If x<2^(n-1), query F(x). For its sibling x+2^(n-1),
 * known-coordinate triangularity implies F(x+high)=F(x) XOR high:
 * all lower output bits depend only on lower input bits, and injectivity
 * makes the high output bit toggle across these two inputs.
 *
 * This reconstructs the complete truth table with exactly 2^(n-1)
 * forward queries, proving the tight upper bound for an exact degree
 * certifier under this STRONGER known-coordinate-compatible promise.
 *
 * @param {(input:number)=>number} compatibleOracle
 * @param {number} bits
 * @returns {{table:number[],queries:number}}
 */
function reconstructKnownCompatiblePermutation(compatibleOracle,bits) {
  if(!Number.isInteger(bits)||bits<3||bits>12)
    throw new RangeError('Expected 3..12 compatible permutation bits');
  const high=2**(bits-1);
  const mask=2**bits-1;
  const table=Array(2**bits).fill(0);
  for(let prefix=0;prefix<high;prefix++) {
    const value=compatibleOracle(prefix);
    if(!Number.isInteger(value)||value<0||value>mask)
      throw new TypeError('Expected unsigned n-bit compatible oracle output');
    table[prefix]=value;
    table[prefix+high]=(value^high)>>>0;
  }
  return {table,queries:high};
}


module.exports={
  adaptivePermutationTranscript,exactVectorAnfDegree,swapIdentityOutputs,
  hiddenSwapDegreeWitness,compatibleHighestBitGate,compatibleDegreeWitness,
  reconstructKnownCompatiblePermutation
};

if(require.main===module) {
  process.stdout.write('PERMUTATION_DEGREE_CERTIFICATE_LOWER_BOUND '+
    JSON.stringify(hiddenSwapDegreeWitness(10,2**10-2))+'\n');
}
