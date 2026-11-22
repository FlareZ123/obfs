'use strict';

const {performance}=require('node:perf_hooks');

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
 * counts running and waiting operations after identity resolution. An optional
 * global capacity reserves a slot before invoking the identity resolver,
 * bounding outstanding asynchronous lookups as well as all principals'
 * running and waiting calls. Both limits default to unlimited.
 * A rejected request never enters a principal queue or executes private work.
 * FIFO applies after the asynchronous principal resolver has settled.
 * An optional principal-resolution deadline rejects stalled asynchronous
 * lookups and releases their global reservations. This cannot interrupt a
 * synchronous blocked event loop or cancel the resolver's own I/O; a late
 * resolver result is ignored and cannot execute protected work.
 * An elapsed-time check also refuses late completion when a blocked event
 * loop prevents the deadline timer from running; it cannot undo the time
 * already spent in a blocking resolver.
 * The optional abortPrincipalLookup flag passes an AbortSignal to the
 * principal resolver and aborts it on expiry, allowing cooperating external
 * identity providers to cancel their own pending I/O. Cancellation remains
 * best effort and cannot force arbitrary user code to settle.
 *
 * @param {(request:import('node:http').IncomingMessage,signal?:AbortSignal)=>string|Promise<string>} principalOf
 * @param {{maxPendingPerPrincipal?:number,maxPendingTotal?:number,maxPrincipalResolutionMs?:number,abortPrincipalLookup?:boolean}} [options]
 * @returns {(request:import('node:http').IncomingMessage,execute:()=>Promise<void>)=>Promise<void>}
 */
function createScoKeyedIsolation(principalOf,options={}) {
  if(typeof principalOf!=='function')throw new TypeError('principalOf must be a function');
  const limit=options.maxPendingPerPrincipal??Infinity;
  const totalLimit=options.maxPendingTotal??Infinity;
  const resolutionDeadline=options.maxPrincipalResolutionMs??Infinity;
  const cancelLookup=options.abortPrincipalLookup??false;
  if(limit!==Infinity&&(!Number.isSafeInteger(limit)||limit<1)) {
    throw new TypeError('maxPendingPerPrincipal must be a positive safe integer');
  }
  if(totalLimit!==Infinity&&(!Number.isSafeInteger(totalLimit)||totalLimit<1)) {
    throw new TypeError('maxPendingTotal must be a positive safe integer');
  }
  // Node clamps longer setTimeout delays to 1ms. Refuse that surprising
  // configuration rather than silently timing out immediately.
  if(resolutionDeadline!==Infinity&&(!Number.isSafeInteger(resolutionDeadline)||
     resolutionDeadline<1||resolutionDeadline>2147483647)) {
    throw new TypeError('maxPrincipalResolutionMs must be 1..2147483647 milliseconds');
  }
  if(typeof cancelLookup!=='boolean'||cancelLookup&&resolutionDeadline===Infinity){
    throw new TypeError('abortPrincipalLookup requires a finite principal-resolution deadline');
  }
  let totalPending=0;
  /** @type {Map<string,Promise<void>>} */
  const tails=new Map();
  /** @type {Map<string,number>} */
  const pending=new Map();
  return async function runRpcIsolated(request,execute) {
    // Reserve global capacity before awaiting an identity provider. Otherwise
    // arbitrary unresolved lookups bypass maxPendingTotal and occupy memory.
    if(totalPending>=totalLimit)throw new ScoIsolationBusyError();
    totalPending++;
    try{
      // A Node timer can fire late when an identity resolver blocks the event
      // loop. Measure actual elapsed time as well to prevent a result that
      // only settles after the deadline from entering private execution.
      const lookupStarted=resolutionDeadline===Infinity?0:performance.now();
      const controller=cancelLookup?new AbortController():undefined;
      const resolving=controller?principalOf(request,controller.signal):principalOf(request);
      let principal;
      if(resolutionDeadline===Infinity||typeof resolving==='string'){
        // Preserve the original one-await fast path for synchronous verifiers.
        principal=await resolving;
      }else{
        // Synchronously fulfilled promises are common for cached sessions.
        // Let their settlement microtask run before registering a costly
        // Node timer. An unresolved lookup still receives a real deadline.
        let settled=false;
        let rejected=false;
        let value;
        const tracked=Promise.resolve(resolving).then(
          result=>{settled=true;value=result;},
          error=>{settled=true;rejected=true;value=error;}
        );
        await Promise.resolve();
        if(!settled){
          /** @type {NodeJS.Timeout|undefined} */
          let timer;
          try{
            await Promise.race([
              tracked,
              new Promise((_,reject)=>{
                timer=setTimeout(()=>{
                  controller?.abort();
                  reject(new ScoIsolationBusyError());
                },resolutionDeadline);
              })
            ]);
          }finally{
            if(timer!==undefined)clearTimeout(timer);
          }
        }
        if(rejected)throw value;
        principal=value;
      }
      if(resolutionDeadline!==Infinity &&
         performance.now()-lookupStarted>=resolutionDeadline) {
        controller?.abort();
        throw new ScoIsolationBusyError();
      }
      if(typeof principal!=='string'||principal.length<1||principal.length>256) {
        throw new TypeError('Authenticated principal must be a nonempty string of at most 256 characters');
      }
      const count=pending.get(principal)??0;
      if(count>=limit)throw new ScoIsolationBusyError();
      pending.set(principal,count+1);
      const previous=tails.get(principal);
      /** @type {()=>void} */
      let release=()=>{};
      /** @type {Promise<void>} */
      const finished=new Promise(resolve=>{release=()=>resolve();});
      tails.set(principal,finished);
      try {
        if(previous)await previous;
        await execute();
      }finally{
        if(tails.get(principal)===finished)tails.delete(principal);
        const outstanding=pending.get(principal)??1;
        if(outstanding===1)pending.delete(principal);
        else pending.set(principal,outstanding-1);
        release();
      }
    }finally{
      // Also release on failed, invalid and rejected identity resolutions,
      // including requests that never enter a principal-specific queue.
      totalPending--;
    }
  };
}

module.exports={createScoKeyedIsolation,ScoIsolationBusyError};
