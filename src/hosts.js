'use strict';

/**
 * Canonicalize a declarative JavaScript execution-host name. DNS spelling
 * retains the compiler's original ASCII acceptance grammar. Bracketed IPv6
 * literals are validated through the WHATWG URL parser so compressed and
 * expanded spellings denote the same location.hostname value.
 *
 * This is a local environment/routing check, not an authorization primitive.
 * @param {string} host
 * @returns {string}
 */
function canonicalAllowedHost(host) {
  if(typeof host!=='string')throw new TypeError('allowedHosts must contain strings');
  const lowercase=host.toLowerCase();
  if(/^[a-z0-9.-]+$/u.test(lowercase))return lowercase;
  if(/^\[[0-9a-f:.]+\]$/u.test(lowercase)) {
    try {
      return new URL('http://'+lowercase).hostname.toLowerCase();
    } catch(error) {
      // Invalid IPv6 literals are deliberately refused.
    }
  }
  throw new TypeError('allowedHosts must contain valid DNS names or bracketed IPv6 literals');
}

/**
 * A single normalized array must control the browser's generated guard and
 * the trusted SCO Host routing prefilter. Reject invalid declared values
 * before starting any public server. Never accept ports in this allowlist.
 * @param {string[]} hosts
 * @returns {string[]}
 */
function canonicalAllowedHosts(hosts) {
  if(!Array.isArray(hosts)||!hosts.length) {
    throw new TypeError('allowedHosts must be a nonempty array');
  }
  return [...new Set(hosts.map(canonicalAllowedHost))];
}

/**
 * Extract the routing hostname from a requester-supplied HTTP Host field.
 * A bracketed IPv6 literal can contain an optional numeric port, with no
 * userinfo, path or trailing suffix. DNS entries retain prior colon/port
 * behavior for compatibility with existing handlers.
 * @param {string} header
 * @returns {string|null}
 */
function routingHostname(header) {
  if(!header.startsWith('['))return header.split(':')[0].toLowerCase();
  const closing=header.indexOf(']');
  if(closing<2 || !/^(?::[0-9]+)?$/u.test(header.slice(closing+1)))return null;
  try {
    return new URL('http://'+header).hostname.toLowerCase();
  } catch(error) {
    return null;
  }
}

module.exports={canonicalAllowedHosts,routingHostname};
