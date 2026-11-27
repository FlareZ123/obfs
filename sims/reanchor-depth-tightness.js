'use strict';

const {invertByReanchoring}=
  require('./random-affine-anchor-compatible-inversion');

/**
 * Nonlinear compatible 32-bit permutation. The low two bits are
 * unchanged; each later output bit toggles on two prior input bits.
 * At anchor zero every finite-difference basis column is the identity.
 * @param {number} input unsigned 32-bit word
 * @returns {number}
 */
function chainPermutation(input) {
  let output=input>>>0;
  for(let bit=2;bit<32;bit++) {
    const dependency=((input>>>(bit-1))&1)&((input>>>(bit-2))&1);
    output=(output^(dependency<<bit))>>>0;
  }
  return output;
}

/**
 * Independent inverse by triangular substitution, reading no
 * chosen-query inverter internals.
 * @param {number} output unsigned 32-bit word
 * @returns {number}
 */
function inverseChainPermutation(output) {
  let input=output&3;
  for(let bit=2;bit<32;bit++) {
    const dependency=((input>>>(bit-1))&1)&((input>>>(bit-2))&1);
    const recovered=((output>>>bit)&1)^dependency;
    input=(input|(recovered<<bit))>>>0;
  }
  return input;
}

/**
 * Return the actual 32-bit source and chosen-query transcript summary.
 * The interpolation has 33 distinct vertices; the nonlinear chain
 * requires 30 further corrections and 31 distinct candidate queries.
 * @returns {{target:number,recovered:number,anchor:number,
 *   corrections:number,queries:number,identityColumns:boolean,
 *   candidateFormulaHolds:boolean}}
 */
function runEvidence() {
  const secret=0xffffffff;
  const target=chainPermutation(secret);
  const identityColumns=chainPermutation(0)===0&&
    Array.from({length:32},(_,bit)=>
      chainPermutation((2**bit)>>>0)===(2**bit)>>>0).every(Boolean);
  const attempt=invertByReanchoring(chainPermutation,target,0,1);
  let candidate=target;
  let candidateFormulaHolds=true;
  for(let correction=0;correction<=30;correction++) {
    const expected=(2**(correction+2)-1)>>>0;
    if(candidate!==expected)candidateFormulaHolds=false;
    if(chainPermutation(candidate)===target)break;
    candidate=(candidate^(target^chainPermutation(candidate)))>>>0;
  }
  return {target,recovered:attempt.value,anchor:attempt.anchor,
    corrections:attempt.corrections,queries:attempt.queries,
    identityColumns,candidateFormulaHolds};
}

if(require.main===module)console.log('REANCHOR_DEPTH '+JSON.stringify(runEvidence()));
module.exports={chainPermutation,inverseChainPermutation,runEvidence};
