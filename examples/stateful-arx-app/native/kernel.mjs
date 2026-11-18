'use strict';

/**
 * Rotate one UInt32 word, preserving JS bitwise coercion.
 * @param {number} word
 * @param {number} shift
 * @returns {number}
 */
function rotl(word,shift){
  return ((word<<shift)|(word>>>(32-shift)))>>>0;
}

/**
 * Evolve four UInt32 state words with an intentionally nonlinear,
 * integer-only ARX transition. This is an experimental workload.
 * It is not designed or claimed to be a cryptographic primitive.
 *
 * @param {Uint32Array} state Exactly four mutable words.
 * @param {number} codeUnit One UTF-16 code unit.
 * @param {number} serial Global code-unit index.
 * @returns {void}
 */
export function advance(state,codeUnit,serial){
  const first=state[0],second=state[1],third=state[2],fourth=state[3];
  const offset=Math.imul((serial+1)|0,0x9e3779b9)>>>0;
  const key=(codeUnit^offset)>>>0;
  const a=(first+second+key)>>>0;
  const b=(second^rotl(third,7))>>>0;
  const c=(third+rotl(fourth,11)+key)>>>0;
  const d=(fourth^rotl(a,16))>>>0;
  state[0]=(a^rotl(b,5))>>>0;
  state[1]=(b+rotl(c,9))>>>0;
  state[2]=(c^rotl(d,13))>>>0;
  state[3]=(d+rotl(a,21))>>>0;
}
