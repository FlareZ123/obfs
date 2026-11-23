'use strict';

/** @type {WeakMap<Function,(calls:unknown)=>boolean>} */
const recognizedBatches=new WeakMap();

/**
 * @typedef {{method:string,args:unknown[]}} RpcBatchCall
 * @typedef {{ok:true,value:unknown}|{ok:false,error:string}} RpcBatchResult
 */

/**
 * Construct a bounded server-resident batch method for use inside SCO's
 * authenticated remoteMethods registry. The caller must register it as
 * `batch`; authorization still runs through createScoHandler.authorizeRpc.
 *
 * Calls are validated completely before execution and run sequentially to
 * preserve the specified side-effect order. Individual operation failures
 * are returned as generic, per-item results. Neither method implementations
 * nor their private exceptions are shipped to clients.
 *
 * @param {Record<string,(...args:any[])=>unknown|Promise<unknown>>} methods
 * @param {{maxCalls?:number,yieldEvery?:number}} [options]
 * `yieldEvery` is explicit Node-server cooperative scheduling. It yields the
 * event loop between contiguous chunks of a single ordered batch. Enabling
 * it can change the interleaving of concurrent requests and must be admitted
 * only for APIs that allow that external scheduling difference.
 * @returns {(calls:RpcBatchCall[])=>Promise<RpcBatchResult[]>}
 */
function createScoBatchMethod(methods,options={}) {
  if (!methods || typeof methods!=='object' || !Object.keys(methods).length) {
    throw new TypeError('Batch method requires a nonempty operation registry');
  }
  const maxCalls=options.maxCalls??64;
  if (!Number.isSafeInteger(maxCalls) || maxCalls<1 || maxCalls>1024) {
    throw new TypeError('maxCalls must be a positive integer up to 1024');
  }
  const yieldEvery=options.yieldEvery??0;
  if(!Number.isSafeInteger(yieldEvery)||yieldEvery<0||yieldEvery>1024)
    throw new TypeError('yieldEvery must be zero or a positive integer up to 1024');
  /** @type {Map<string,(...args:any[])=>unknown|Promise<unknown>>} */
  const registry=new Map();
  for(const [name,task] of Object.entries(methods)) {
    if (name==='batch' || typeof task!=='function' || recognizedBatches.has(task)) {
      // Renaming a nested batch method must not bypass the HTTP handler's
      // single-level preflight authorization for its individual operations.
      throw new TypeError('Batch registry cannot contain a nested batch or nonfunction operation');
    }
    registry.set(name,task);
  }
  /** @param {unknown} calls @returns {boolean} */
  const validCalls=calls=>Array.isArray(calls) && calls.length>0 &&
    calls.length<=maxCalls && !calls.some(call=>!call ||
      typeof call!=='object' || !Object.hasOwn(call,'method') ||
      !Object.hasOwn(call,'args') || typeof call.method!=='string' ||
      !registry.has(call.method) || !Array.isArray(call.args));
  /** @type {(calls:RpcBatchCall[])=>Promise<RpcBatchResult[]>} */
  const execute=async function(calls){
    // A recognized helper receives one outer RPC argument. The HTTP
    // preflight deliberately skips malformed arity; without this check,
    // JavaScript would ignore surplus arguments while still executing the
    // first argument's inner operations without their policy review.
    if(arguments.length!==1||!validCalls(calls)) {
      throw new TypeError('Invalid or oversized RPC batch');
    }
    /** @type {RpcBatchResult[]} */
    const results=[];
    for(let index=0;index<calls.length;index++) {
      const call=calls[index];
      try {
        const task=registry.get(call.method);
        if (!task) throw new TypeError('Unknown batch method');
        const value=await task(...call.args);
        results.push({ok:true,value});
      } catch (error) {
        results.push({ok:false,error:'Operation failed'});
      }
      // One explicit Node turn lets a competing authorized account's HTTP
      // request enter the server while the current long private batch runs.
      // Per-batch item ordering and the unchanged default remain intact.
      if(yieldEvery>0&&(index+1)%yieldEvery===0&&index+1<calls.length)
        await new Promise(resolve=>setImmediate(resolve));
    }
    return results;
  };
  recognizedBatches.set(execute,validCalls);
  return execute;
}

/**
 * Test whether a function is the exact helper returned by this module.
 * Wrappers deliberately do not inherit recognition: callers that require
 * automatic inner authorization must register the direct helper.
 * @param {unknown} task
 * @returns {boolean}
 */
function isScoBatchMethod(task) {
  return typeof task==='function'&&recognizedBatches.has(task);
}

/**
 * Inspect a recognized batch's requested operations before it executes.
 * A null result means the function is not a batch helper from this module.
 * Invalid batch shapes are excluded from costly inner authorizer calls,
 * then rejected by the helper's own fail-closed validation.
 * @param {Function} task
 * @param {unknown[]} args
 * @returns {RpcBatchCall[]|null}
 */
function getScoBatchCalls(task,args) {
  const validCalls=recognizedBatches.get(task);
  if(!validCalls)return null;
  // Invalid batches never run an inner method. Skip their potentially costly
  // per-item authorization calls; the batch helper still rejects execution.
  return args.length===1 && validCalls(args[0]) ?
    /** @type {RpcBatchCall[]} */ (args[0]) : [];
}

module.exports={createScoBatchMethod,getScoBatchCalls,isScoBatchMethod};
