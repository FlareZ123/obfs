'use strict';

/** @type {Record<string,string>} */
const overrides=require('./unicode-casefold-overrides');

/**
 * Apply Unicode 15.1 default full case folding.
 *
 * The generated override table contains every scalar whose full default fold
 * differs from its lowercase mapping. Other scalars use per-code-point
 * lowercase. Turkic-only T mappings are deliberately excluded. NFC is applied
 * before and after folding so canonically equivalent path strings share a key.
 *
 * @param {string} value
 * @returns {string}
 */
function unicodeCaseFold(value) {
  let folded='';
  for(const character of value.normalize('NFC')) {
    const codePoint=character.codePointAt(0);
    if(codePoint===undefined)continue;
    const override=overrides[codePoint.toString(16).toUpperCase()];
    folded+=override??character.toLowerCase();
  }
  return folded.normalize('NFC');
}

module.exports={unicodeCaseFold};
