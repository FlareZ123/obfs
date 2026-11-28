'use strict';

/**
 * @typedef {Omit<import('./sco').ScoOptions,'publicPaths'|'remoteMethods'>} ScoSelectedHandlerOptions
 */

/**
 * Snapshot trusted selected-SCO handler policy settings once, including
 * inherited and non-enumerable accessors that object spread omits.
 *
 * Own enumerable accessors have already been evaluated by the spread; do not
 * read them twice. Capture all other documented policy keys through a single
 * accessor read while keeping forbidden caller-supplied publicPaths and
 * remoteMethods out of the compiler-owned selected-handler namespace.
 *
 * @param {ScoSelectedHandlerOptions} options
 * @returns {ScoSelectedHandlerOptions}
 */
function snapshotSelectedOptions(options){
  const selected={...options};
  /** @type {(keyof ScoSelectedHandlerOptions)[]} */
  const permitted=[
    'routePrefix','allowedHosts','authorizeRead','authorizeRpc',
    'admitRpcEarly','authorizeOperation','runRpcIsolated','maxRpcBytes',
    'closedWorld','reviewedOpaqueAssets'
  ];
  for(const key of permitted){
    if(Object.hasOwn(selected,key)||!Reflect.has(options,key))continue;
    Object.defineProperty(selected,key,{
      value:Reflect.get(options,key),
      configurable:true,enumerable:true,writable:true
    });
  }
  return selected;
}

module.exports={snapshotSelectedOptions};
