'use strict';

/** @type {WeakSet<Function>} */
const recognizedBatches=new WeakSet();

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
 * @param {{maxCalls?:number}} [options]
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
  /** @type {(calls:RpcBatchCall[])=>Promise<RpcBatchResult[]>} */
  const execute=async calls=>{
    if (!Array.isArray(calls) || !calls.length || calls.length>maxCalls ||
        calls.some(call=>!call || typeof call!=='object' ||
          typeof call.method!=='string' || !registry.has(call.method) ||
          !Array.isArray(call.args))) {
      throw new TypeError('Invalid or oversized RPC batch');
    }
    /** @type {RpcBatchResult[]} */
    const results=[];
    for(const call of calls) {
      try {
        const task=registry.get(call.method);
        if (!task) throw new TypeError('Unknown batch method');
        const value=await task(...call.args);
        results.push({ok:true,value});
      } catch (error) {
        results.push({ok:false,error:'Operation failed'});
      }
    }
    return results;
  };
  recognizedBatches.add(execute);
  return execute;
}

/**
 * Inspect a recognized batch's requested operations before it executes.
 * A null result means the function is not a batch helper from this module.
 * Invalid batch shapes remain subject to the helper's own fail-closed check.
 * @param {Function} task
 * @param {unknown[]} args
 * @returns {RpcBatchCall[]|null}
 */
function getScoBatchCalls(task,args) {
  if(!recognizedBatches.has(task)) return null;
  return args.length===1 && Array.isArray(args[0]) ? args[0] : [];
}

module.exports={createScoBatchMethod,getScoBatchCalls};
