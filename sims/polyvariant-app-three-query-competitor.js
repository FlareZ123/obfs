'use strict';

const {performance}=require('node:perf_hooks');

const targetNames=Object.freeze(['round1','round2','round3']);

/**
 * Identical three-query, hypothesis-restricted attacker for native, minified,
 * obfuscated, and already reconstructed ESM distributions.
 *
 * It observes f(0) once per exported helper, then commits to the signed
 * Int32 translation hypothesis. No source parser, compiler, original source,
 * or held-out output is consulted during the attack. The verifier must
 * separately test the resulting clone against unseen inputs.
 *
 * @param {Record<string,(input:unknown)=>number>} exposed
 * @returns {{
 *   clone:Record<string,(input:unknown)=>number>,
 *   offsets:Record<string,number>,
 *   oracleCalls:number,
 *   attackMs:number
 * }}
 */
function threeQueryTranslationClone(exposed){
  /** @type {Record<string,(input:unknown)=>number>} */
  const clone=Object.create(null);
  /** @type {Record<string,number>} */
  const offsets=Object.create(null);
  const started=performance.now();
  let oracleCalls=0;
  for(const name of targetNames){
    const original=exposed[name];
    if(typeof original!=='function'){
      throw new TypeError('Missing public numeric export: '+name);
    }
    const offset=original(0);
    oracleCalls++;
    if(!Number.isInteger(offset)||(offset|0)!==offset){
      throw new TypeError('Public output violates Int32 model: '+name);
    }
    offsets[name]=offset;
    clone[name]=(input)=>((/** @type {number} */(input)|0)+offset)|0;
  }
  return {clone,offsets,oracleCalls,attackMs:performance.now()-started};
}

module.exports={threeQueryTranslationClone};
