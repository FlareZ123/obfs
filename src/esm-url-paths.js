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
 * WHATWG URL parsing removes literal TAB, LF and CR from the input before
 * path normalization, while POSIX treats those characters as ordinary path
 * data. Reject C0 controls and DEL in the pathname before comparing module
 * identities. Query/fragment text is excluded because it does not name a file.
 * @param {string} specifier
 * @returns {boolean}
 */
function hasPathnameControlCharacter(specifier) {
  const pathname=specifier.split(/[?#]/u,1)[0];
  return /[\u0000-\u001f\u007f]/u.test(pathname);
}

module.exports={hasTerminalUrlDotSegment,hasPathnameControlCharacter};
