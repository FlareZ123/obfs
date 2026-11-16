'use strict';

/**
 * Rejection used when the optional per-principal outstanding-call limit is
 * reached before protected authorization or execution begins. The SCO HTTP
 * handler translates this specific pre-execution failure into HTTP 429.
 */
class ScoIsolationBusyError extends Error {
  constructor() {
    super('SCO principal queue is full');
    this.name='ScoIsolationBusyError';
  }
}

/**
 * Construct a per-principal FIFO isolation callback for createScoHandler.
 * The principal resolver must derive a stable identifier from an authenticated
 * server-side session, never from an unverified request header. Each principal
 * has an independent queue; an exception never strands subsequent requests.
 *
 * This serializes authorization and execution for one principal only. It does
 * not make external storage transactional or validate state transitions inside
 * a batch. The supplied execute callback must settle; no timeout or
 * reentrant execution is introduced here. An optional per-principal limit
 * counts running and waiting operations. An optional global capacity limits
 * all principals' outstanding calls. Both default to unlimited for backward
 * compatibility. A rejected request
 * does not enter the queue or invoke protected work. FIFO applies after the
 * asynchronous principal resolver has settled.
 *
 * @param {(request:import('node:http').IncomingMessage)=>string|Promise<string>} principalOf
 * @param {{maxPendingPerPrincipal?:number,maxPendingTotal?:number}} [options]
 * @returns {(request:import('node:http').IncomingMessage,execute:()=>Promise<void>)=>Promise<void>}
 */
function createScoKeyedIsolation(principalOf,options={}) {
  if(typeof principalOf!=='function')throw new TypeError('principalOf must be a function');
  const limit=options.maxPendingPerPrincipal??Infinity;
  const totalLimit=options.maxPendingTotal??Infinity;
  if(limit!==Infinity&&(!Number.isSafeInteger(limit)||limit<1)) {
    throw new TypeError('maxPendingPerPrincipal must be a positive safe integer');
  }
  if(totalLimit!==Infinity&&(!Number.isSafeInteger(totalLimit)||totalLimit<1)) {
    throw new TypeError('maxPendingTotal must be a positive safe integer');
  }
  let totalPending=0;
  /** @type {Map<string,Promise<void>>} */
  const tails=new Map();
  /** @type {Map<string,number>} */
  const pending=new Map();
  return async function runRpcIsolated(request,execute) {
    const principal=await principalOf(request);
    if(typeof principal!=='string'||principal.length<1||principal.length>256) {
      throw new TypeError('Authenticated principal must be a nonempty string of at most 256 characters');
    }
    const count=pending.get(principal)??0;
    if(count>=limit||totalPending>=totalLimit)throw new ScoIsolationBusyError();
    pending.set(principal,count+1);
    totalPending++;
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
      const outstanding=pending.get(principal)??1;
      if(outstanding===1)pending.delete(principal);
      else pending.set(principal,outstanding-1);
      totalPending--;
      release();
    }
  };
}

module.exports={createScoKeyedIsolation,ScoIsolationBusyError};
