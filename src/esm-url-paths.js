'use strict';

/**
 * A final literal dot segment makes WHATWG URL resolution retain a trailing
 * slash, while POSIX normalization removes the segment and drops that slash.
 * Such a specifier cannot be mapped safely to an input-file identity.
 * @param {string} specifier
 * @returns {boolean}
 */
function hasTerminalUrlDotSegment(specifier) {
  const pathname=specifier.split(/[?#]/u,1)[0];
  const finalSegment=pathname.slice(pathname.lastIndexOf('/')+1);
  return finalSegment==='.'||finalSegment==='..';
}

/**
 * WHATWG URL parsing removes literal TAB, LF and CR from the input and
 * trims trailing C0 controls or spaces at the whole-input boundary. POSIX
 * treats those characters as ordinary path data. Reject C0/DEL anywhere in
 * the pathname and trailing U+0020 only when no query or fragment follows.
 * Internal spaces and query/fragment suffix spaces remain valid.
 * @param {string} specifier
 * @returns {boolean}
 */
function hasUrlPathnameNormalizationHazard(specifier) {
  const pathname=specifier.split(/[?#]/u,1)[0];
  return /[\u0000-\u001f\u007f]/u.test(pathname) ||
    (!/[?#]/u.test(specifier) && specifier.endsWith(' '));
}

module.exports={hasTerminalUrlDotSegment,hasUrlPathnameNormalizationHazard};
