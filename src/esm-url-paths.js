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

module.exports={hasTerminalUrlDotSegment};
