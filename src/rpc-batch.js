'use strict';

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
    if (name==='batch' || typeof task!=='function') {
      throw new TypeError('Batch registry cannot contain a nested batch or nonfunction operation');
    }
    registry.set(name,task);
  }
  return async calls=>{
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
        const value=await registry.get(call.method)(...call.args);
        results.push({ok:true,value});
      } catch (error) {
        results.push({ok:false,error:'Operation failed'});
      }
    }
    return results;
  };
}

module.exports={createScoBatchMethod};
