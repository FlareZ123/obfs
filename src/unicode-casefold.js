'use strict';

/** @type {Readonly<Record<string,string>>} */
const overrides=require('./unicode-casefold-overrides');

/**
 * Apply Unicode 15.1 default full-casefold overrides over a per-code-point
 * lowercase fallback.
 *
 * The generated table contains every Unicode 15.1 scalar whose full default
 * fold differs from lowercase. Other scalars use String.prototype.toLowerCase
 * one code point at a time, so mappings for post-15.1 assignments follow the
 * Node runtime's Unicode database. Turkic-only T mappings are excluded. This
 * is therefore a versioned hybrid, not a runtime-independent Unicode 17 table.
 * NFC is applied before and after folding so canonical equivalents share a key.
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
