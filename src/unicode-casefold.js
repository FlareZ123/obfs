'use strict';

/** @type {Readonly<Record<string,string>>} */
const caseFoldData=require('./unicode-casefold-data');

/**
 * Apply Unicode 17.0.0 default full case folding.
 *
 * The pinned table contains all Unicode 17.0.0 common/full (C/F) mappings;
 * unlisted scalars are unchanged. Turkic-only T mappings are excluded. This
 * makes the fourth path key deterministic across Node versions and avoids
 * relying on runtime-specific lowercase tables. NFC is applied before and
 * after folding so canonical equivalents share a key.
 *
 * @param {string} value
 * @returns {string}
 */
function unicodeCaseFold(value) {
  let folded='';
  for(const character of value.normalize('NFC')) {
    const codePoint=character.codePointAt(0);
    if(codePoint===undefined)continue;
    const mapping=caseFoldData[codePoint.toString(16).toUpperCase().padStart(4,'0')];
    folded+=mapping??character;
  }
  return folded.normalize('NFC');
}

module.exports={unicodeCaseFold};
