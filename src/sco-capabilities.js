'use strict';

const {AsyncLocalStorage}=require('node:async_hooks');
const {randomBytes}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {createScoKeyedIsolation}=require('./rpc-keyed-isolation');

/** @typedef {{principal:string,active:boolean}} ScoScopeState */
/** @typedef {{principal:string,value:unknown,expiresAt:number}} ScoPrivateEntry */

/**
 * Bind an existing SCO request isolation callback to an authenticated principal.
 * The principal resolver must verify server-side session credentials and must
 * not trust a client-supplied account name. This provides context only for
 * operations awaited inside the request; detached work loses access after the
 * RPC callback settles. Server-side authorization is still required.
 *
 * @param {(request:import('node:http').IncomingMessage)=>string|Promise<string>} principalOf
 * @param {{maxPendingPerPrincipal?:number,maxPendingTotal?:number}} [options]
 * @returns {{runRpcIsolated:(request:import('node:http').IncomingMessage,execute:()=>Promise<void>)=>Promise<void>,currentPrincipal:()=>string}}
 */
function createScoCapabilityScope(principalOf,options={}) {
  if(typeof principalOf!=='function')throw new TypeError('principalOf must be a function');
  /** @type {WeakMap<import('node:http').IncomingMessage,string>} */
  const resolved=new WeakMap();
  /** @type {AsyncLocalStorage<ScoScopeState>} */
  const storage=new AsyncLocalStorage();
  const isolate=createScoKeyedIsolation(async request=>{
    const principal=await principalOf(request);
    // Let the underlying keyed-isolation validation reject invalid names.
    if(typeof principal==='string')resolved.set(request,principal);
    return principal;
  },options);

  /** @returns {string} */
  function currentPrincipal() {
    const scope=storage.getStore();
    if(!scope?.active)throw new Error('Private SCO capability requires an active authenticated RPC scope');
    return scope.principal;
  }

  /**
   * @param {import('node:http').IncomingMessage} request
   * @param {()=>Promise<void>} execute
   * @returns {Promise<void>}
   */
  async function runRpcIsolated(request,execute) {
    try {
      await isolate(request,async()=>{
        const principal=resolved.get(request);
        if(!principal)throw new Error('Authenticated RPC principal is unavailable');
        /** @type {ScoScopeState} */
        const scope={principal,active:true};
        try {
          await storage.run(scope,execute);
        }finally{
          scope.active=false;
        }
      });
    }finally{
      resolved.delete(request);
    }
  }
  return {runRpcIsolated,currentPrincipal};
}

/**
 * Server-private opaque handles. Values remain in trusted server memory and
 * are accessible only to a trusted callback inside the authenticated principal
 * scope. This is a bounded capability store, not a general-purpose persistence
 * layer. A compromised server or authorized online relay remains out of scope.
 *
 * @param {()=>string} currentPrincipal Bound scope's currentPrincipal method
 * @param {{ttlMs?:number,maxHandles?:number,maxHandlesPerPrincipal?:number}} [options]
 * @returns {{issue:(value:unknown)=>string,use:<T>(token:string,fn:(value:unknown)=>T)=>T,revoke:(token:string)=>boolean}}
 */
function createScoPrivateHandles(currentPrincipal,options={}) {
  if(typeof currentPrincipal!=='function')throw new TypeError('currentPrincipal must be a function');
  const ttlMs=options.ttlMs??300000;
  const maxHandles=options.maxHandles??4096;
  const maxPerPrincipal=options.maxHandlesPerPrincipal??256;
  if(!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>86400000 ||
     !Number.isSafeInteger(maxHandles)||maxHandles<1 ||
     !Number.isSafeInteger(maxPerPrincipal)||maxPerPrincipal<1 ||
     maxPerPrincipal>maxHandles) {
    throw new TypeError('Invalid SCO private capability limits');
  }
  /** @type {Map<string,ScoPrivateEntry>} */
  const entries=new Map();
  /** @type {Map<string,number>} */
  const perPrincipal=new Map();
  /** @param {string} token @param {ScoPrivateEntry} record @returns {void} */
  function forget(token,record) {
    entries.delete(token);
    const remaining=(perPrincipal.get(record.principal)??1)-1;
    if(remaining>0)perPrincipal.set(record.principal,remaining);
    else perPrincipal.delete(record.principal);
  }
  /** @param {number} now @returns {void} */
  function sweepExpired(now) {
    for(const [token,entry] of entries) {
      if(now>=entry.expiresAt)forget(token,entry);
    }
  }
  /** @param {unknown} value @returns {string} */
  function issue(value) {
    const principal=currentPrincipal();
    const now=performance.now();
    if(entries.size>=maxHandles || (perPrincipal.get(principal)??0)>=maxPerPrincipal) {
      sweepExpired(now);
    }
    if(entries.size>=maxHandles || (perPrincipal.get(principal)??0)>=maxPerPrincipal) {
      throw new Error('Private SCO capability capacity reached');
    }
    let token;
    do {token=randomBytes(32).toString('base64url');} while(entries.has(token));
    entries.set(token,{principal,value,expiresAt:now+ttlMs});
    perPrincipal.set(principal,(perPrincipal.get(principal)??0)+1);
    return token;
  }
  /** @param {string} token @param {string} principal @returns {ScoPrivateEntry} */
  function getAuthorized(token,principal) {
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/u.test(token)) {
      throw new Error('Invalid private SCO capability');
    }
    const record=entries.get(token);
    if(!record || record.principal!==principal)throw new Error('Invalid private SCO capability');
    if(performance.now()>=record.expiresAt) {
      forget(token,record);
      throw new Error('Invalid private SCO capability');
    }
    return record;
  }
  /** @template T @param {string} token @param {(value:unknown)=>T} fn @returns {T} */
  function use(token,fn) {
    const principal=currentPrincipal();
    if(typeof fn!=='function')throw new TypeError('Private capability operation must be a function');
    return fn(getAuthorized(token,principal).value);
  }
  /** @param {string} token @returns {boolean} */
  function revoke(token) {
    const principal=currentPrincipal();
    try{
      const record=getAuthorized(token,principal);
      forget(token,record);
      return true;
    }catch(error){
      if(error instanceof Error && error.message==='Invalid private SCO capability')return false;
      throw error;
    }
  }
  return {issue,use,revoke};
}

module.exports={createScoCapabilityScope,createScoPrivateHandles};
