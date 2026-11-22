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
  // Browser location.hostname is WHATWG-canonicalized. Normalize ASCII
  // IPv4 spellings too: 127.1, 127.0.0.1 and 0x7f000001 all identify the
  // same browser hostname. Retain the existing conservative input grammar.
  if(/^[a-z0-9.-]+$/u.test(lowercase) ||
      /^\[[0-9a-f:.]+\]$/u.test(lowercase)) {
    try {
      return new URL('http://'+lowercase).hostname.toLowerCase();
    } catch(error) {
      // Malformed numeric hosts and IPv6 literals are refused.
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
  /** @type {string[]} */
  const canonical=[];
  const declaredLength=hosts.length;
  for(let index=0;index<declaredLength;index++) {
    // Array#map skips sparse slots and could silently shrink the policy.
    if(!Object.hasOwn(hosts,index))throw new TypeError('allowedHosts must contain strings');
    canonical.push(canonicalAllowedHost(hosts[index]));
  }
  return [...new Set(canonical)];
}

/**
 * Extract the routing hostname from a requester-supplied HTTP Host field.
 * A bracketed IPv6 literal can contain an optional numeric port, with no
 * userinfo, path or trailing suffix. ASCII DNS/IPv4 entries also accept a
 * single optional numeric port and use browser-equivalent host normalization.
 * @param {string} header
 * @returns {string|null}
 */
function routingHostname(header) {
  if(!header.startsWith('[')) {
    // Reject userinfo, path delimiters, extra colons and malformed ports;
    // splitting at the first colon would admit invalid Host field suffixes.
    if(!/^[a-z0-9.-]+(?::[0-9]+)?$/iu.test(header))return null;
    try {
      return new URL('http://'+header).hostname.toLowerCase();
    } catch(error) {
      return null;
    }
  }
  const closing=header.indexOf(']');
  if(closing<2 || !/^(?::[0-9]+)?$/u.test(header.slice(closing+1)))return null;
  try {
    return new URL('http://'+header).hostname.toLowerCase();
  } catch(error) {
    return null;
  }
}

/**
 * Create an owned, bounded positive cache for the SCO HTTP Host routing
 * prefilter. A normal browser sends the same Host value on successive
 * requests, so its previously validated spelling can be reused without a
 * fresh WHATWG URL parse. Disallowed or malformed headers are never cached,
 * preventing callers from filling the cache with rejected values.
 *
 * This is a routing optimization. It is not an authentication cache:
 * application authorization callbacks must still run on every request.
 *
 * @param {ReadonlySet<string>} allowed
 * @returns {(header:string)=>boolean}
 */
function createRoutingHostResolver(allowed) {
  const permitted=new Set(allowed);
  /** @type {Set<string>} */
  const acceptedHeaders=new Set();
  return header=>{
    if(acceptedHeaders.has(header))return true;
    const hostname=routingHostname(header);
    if(hostname===null || !permitted.has(hostname))return false;
    if(acceptedHeaders.size>=128) {
      const oldest=acceptedHeaders.values().next().value;
      if(oldest!==undefined)acceptedHeaders.delete(oldest);
    }
    acceptedHeaders.add(header);
    return true;
  };
}

module.exports={canonicalAllowedHosts,routingHostname,createRoutingHostResolver};
