'use strict';

/**
 * A deliberately weak, generic static interface adversary for the frozen
 * SCO six-module application's public files. It does not evaluate, import,
 * instrument or parse the protected server source. The compiler currently
 * emits one literal RPC method with an m-prefixed hex identifier; the
 * ordinary-minified equal-trust facade necessarily contains the same ID.
 * This extractor is intentionally bounded to that exact method format
 * rather than claimed as a general JavaScript deobfuscator.
 *
 * @param {string} publicCode
 * @returns {{method:string,endpoint:'/obfs/rpc'}}
 */
function recoverStaticRpcContract(publicCode){
  if(typeof publicCode!=='string')throw TypeError('Expected public source string');
  const matched=[...publicCode.matchAll(/['"](m[0-9a-f]{20,64})['"]/gu)]
    .map(match=>match[1]);
  const names=[...new Set(matched)];
  if(names.length!==1)throw Error('Expected unique literal RPC method in public source');
  const paths=[...publicCode.matchAll(/['"](\/obfs\/rpc)['"]/gu)];
  if(paths.length!==1)throw Error('Expected one literal public RPC endpoint');
  return {method:names[0],endpoint:'/obfs/rpc'};
}

module.exports={recoverStaticRpcContract};
