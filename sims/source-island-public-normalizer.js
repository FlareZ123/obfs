'use strict';

/**
 * Public-only, seedless normalization attack against the current local
 * property-name spelling. This independent attacker has no dependency on the
 * obfuscator, its AST, transformation options, original input, or seed.
 * It learns field names solely from a delivered JavaScript module's bytes.
 *
 * Only a bounded original fixture with static ordinary own-data fields is
 * covered. Replacing arbitrary string occurrences of hash-looking text is
 * not a general semantics-preserving deobfuscator.
 *
 * @param {string} deliveredSource
 * @returns {{code:string,properties:number,labels:string[]}}
 */
function normalizePublicIsland(deliveredSource) {
  if(typeof deliveredSource!=='string')throw new TypeError('Expected public JS source text');
  const labels=[...new Set(deliveredSource.match(/\b_p[a-f0-9]{10}\b/gu)??[])];
  let code=deliveredSource;
  for(let i=0;i<labels.length;i++) {
    const replacement='recoveredPrivateField_'+i;
    if(deliveredSource.includes(replacement))throw new TypeError('Adversarial label collision');
    code=code.replaceAll(labels[i],replacement);
  }
  return {code,properties:labels.length,labels};
}

module.exports={normalizePublicIsland};
