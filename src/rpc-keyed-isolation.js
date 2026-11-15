'use strict';

/**
 * Construct a per-principal FIFO isolation callback for createScoHandler.
 * The principal resolver must derive a stable identifier from an authenticated
 * server-side session, never from an unverified request header. Each principal
 * has an independent queue; an exception never strands subsequent requests.
 *
 * This serializes authorization and execution for one principal only. It does
 * not make external storage transactional or validate state transitions inside
 * a batch. The supplied execute callback must settle; no timeout or
 * reentrant execution is introduced here.
 *
 * @param {(request:import('node:http').IncomingMessage)=>string|Promise<string>} principalOf
 * @returns {(request:import('node:http').IncomingMessage,execute:()=>Promise<void>)=>Promise<void>}
 */
function createScoKeyedIsolation(principalOf) {
  if(typeof principalOf!=='function')throw new TypeError('principalOf must be a function');
  /** @type {Map<string,Promise<void>>} */
  const tails=new Map();
  return async function runRpcIsolated(request,execute) {
    const principal=await principalOf(request);
    if(typeof principal!=='string'||principal.length<1||principal.length>256) {
      throw new TypeError('Authenticated principal must be a nonempty string of at most 256 characters');
    }
    const previous=tails.get(principal);
    /** @type {()=>void} */
    let release=()=>{};
    /** @type {Promise<void>} */
    const finished=new Promise(resolve=>{release=()=>resolve();});
    tails.set(principal,finished);
    if(previous)await previous;
    try {
      await execute();
    }finally{
      if(tails.get(principal)===finished)tails.delete(principal);
      release();
    }
  };
}

module.exports={createScoKeyedIsolation};
