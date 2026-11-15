'use strict';

/**
 * Generate a small ES module facade for server-resident SCO methods. Only
 * method names and the HTTP transport are sent to the client; implementations
 * remain on the trusted SCO host and are protected by authorizeRpc.
 *
 * @param {string[]} methods
 * @param {{endpoint?:string}} [options]
 * @returns {string}
 */
function createScoRpcClientSource(methods, options = {}) {
  if (!Array.isArray(methods) || !methods.length ||
      methods.some(name => typeof name !== 'string' || name.length < 1 || name.length > 128) ||
      new Set(methods).size !== methods.length) {
    throw new TypeError('RPC client methods must be a nonempty list of unique nonempty names');
  }
  const endpoint=options.endpoint ?? '/obfs/rpc';
  // A generated client must not silently send ambient credentials to another origin.
  if (typeof endpoint !== 'string' || !endpoint.startsWith('/') || endpoint.startsWith('//') ||
      /[\\?#\x00-\x20]/.test(endpoint)) {
    throw new TypeError('RPC endpoint must be a same-origin absolute path');
  }
  return `const endpoint=${JSON.stringify(endpoint)};\n` +
    `const methods=Object.create(null);\n` +
    `for(const name of ${JSON.stringify(methods)}){\n` +
    `Object.defineProperty(methods,name,{enumerable:true,value:async(...args)=>{\n` +
    `const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',` +
    `headers:{'content-type':'application/json'},body:JSON.stringify({method:name,args})});\n` +
    `const payload=await response.json();\n` +
    `if(!response.ok||!payload||payload.ok!==true)throw Error('Remote operation failed');\n` +
    `return payload.value;\n` +
    `}});}\nexport default Object.freeze(methods);\n`;
}

module.exports={createScoRpcClientSource};
