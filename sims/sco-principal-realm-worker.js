'use strict';

const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');

// Research worker: each process-local Worker has its own transitive ESM module
// cache. No original implementation bytes are sent over the public RPC.
if(!isMainThread&&workerData?.scoRealmWorker===true){
  if(!parentPort)throw new Error('SCO realm has no message port');
  const channel=parentPort;
  const loaded=import(workerData.entryUrl);
  void loaded.then(()=>channel.postMessage({kind:'ready',ok:true}),
    ()=>channel.postMessage({kind:'ready',ok:false}));
  let queue=Promise.resolve();
  channel.on('message',message=>{
    queue=queue.then(async()=>{
      const methods=await loaded;
      if(!workerData.allowedMethods.includes(message.method)||
         !Object.hasOwn(methods,message.method)||
         typeof methods[message.method]!=='function'){
        throw new TypeError('Unregistered private method');
      }
      const value=await methods[message.method](...message.args);
      channel.postMessage({id:message.id,ok:true,value});
    }).catch(()=>{
      // A worker exception, failed clone, or private rejection must not expose
      // implementation details to the calling realm.
      channel.postMessage({id:message.id,ok:false});
    });
  });
}

/**
 * Experimental server-resident per-principal ESM realm pool.
 * The caller must obtain principal from independently verified server-side
 * authentication. Worker death permanently poisons that principal until the
 * entire pool is explicitly discarded; silent respawn would reset state.
 * This pool does not sandbox compromised server owners or secure untrusted
 * source code, and is not a general serializable JavaScript state emulator.
 *
 * @param {string} absoluteEntryPath Trusted absolute private ESM entry path.
 * @param {string[]} allowedMethods Reviewed direct export names.
 * @param {{maxPrincipals?:number,maxPendingPerPrincipal?:number}} [options]
 * @returns {{
 *   initialize:(principal:string)=>Promise<void>,
 *   call:(principal:string,method:string,args:unknown[])=>Promise<unknown>,
 *   revoke:(principal:string)=>Promise<void>,
 *   close:()=>Promise<void>
 * }}
 */
function createScoPrincipalRealmPool(absoluteEntryPath,allowedMethods,options={}){
  if(typeof absoluteEntryPath!=='string'||!path.isAbsolute(absoluteEntryPath)||
     !Array.isArray(allowedMethods)||!allowedMethods.length||
     allowedMethods.some(name=>typeof name!=='string'||!name)||
     new Set(allowedMethods).size!==allowedMethods.length){
    throw new TypeError('Expected absolute private ESM entry and distinct method names');
  }
  // Caller-owned authorization arrays must not widen the private method
  // registry after a reviewed pool has been constructed.
  const methods=Object.freeze([...allowedMethods]);
  const maxPrincipals=options.maxPrincipals??32;
  const maxPending=options.maxPendingPerPrincipal??64;
  if(!Number.isSafeInteger(maxPrincipals)||maxPrincipals<1||
     !Number.isSafeInteger(maxPending)||maxPending<1){
    throw new TypeError('Expected positive safe realm and queue capacity limits');
  }
  const entryUrl=pathToFileURL(absoluteEntryPath).href;
  /** @type {Map<string,{worker:Worker,ready:Promise<void>,pending:Map<number,{
   *   resolve:(value:unknown)=>void,reject:(reason:Error)=>void}>}>} */
  const realms=new Map();
  const failed=new Set();
  let sequence=0;
  let closed=false;

  /** @param {string} principal */
  function realmFor(principal){
    if(failed.has(principal))throw new Error('Private realm terminated; state reset refused');
    const existing=realms.get(principal);
    if(existing)return existing;
    if(realms.size+failed.size>=maxPrincipals)throw new Error('SCO realm capacity exhausted');
    const worker=new Worker(__filename,{
      workerData:{scoRealmWorker:true,entryUrl,allowedMethods:methods},
      // Worker environment is a *copy*; the principal is trusted server data.
      env:{...process.env,SCO_REALM_PRINCIPAL:principal}
    });
    /** @type {Map<number,{resolve:(value:unknown)=>void,reject:(reason:Error)=>void}>} */
    const pending=new Map();
    /** @type {(value:void)=>void} */
    let readyResolve=()=>{};
    /** @type {(error:Error)=>void} */
    let readyReject=()=>{};
    /** @type {Promise<void>} */
    const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
    // Workers may fail before the operator explicitly awaits initialization.
    void ready.catch(()=>{});
    const realm={worker,pending,ready};
    realms.set(principal,realm);
    worker.on('message',message=>{
      if(message.kind==='ready'){
        if(message.ok===true)readyResolve();
        else readyReject(new Error('Private ESM initialization failed'));
        return;
      }
      const request=pending.get(message.id);
      if(!request)return;
      pending.delete(message.id);
      if(message.ok===true)request.resolve(message.value);
      else request.reject(new Error('Private operation failed'));
    });
    worker.on('exit',()=>{
      readyReject(new Error('Private ESM realm exited'));
      if(realms.get(principal)===realm){
        realms.delete(principal);
        failed.add(principal);
      }
      for(const request of pending.values())request.reject(new Error('Private realm stopped'));
      pending.clear();
    });
    worker.on('error',()=>{
      // Node's exit notification rejects pending requests and poisons state.
    });
    return realm;
  }

  /**
   * Explicit server-side initial import without calling any private method
   * or consuming user-visible state. Account admission must be authenticated
   * by the integrator before invoking this method.
   * @param {string} principal
   * @returns {Promise<void>}
   */
  async function initialize(principal){
    if(closed||typeof principal!=='string'||!principal||principal.length>256){
      throw new TypeError('Invalid private realm principal');
    }
    await realmFor(principal).ready;
  }

  /**
   * @param {string} principal
   * @param {string} method
   * @param {unknown[]} args
   * @returns {Promise<unknown>}
   */
  async function call(principal,method,args){
    if(closed||typeof principal!=='string'||!principal||principal.length>256||
       !methods.includes(method)||!Array.isArray(args)){
      throw new TypeError('Invalid private realm invocation');
    }
    const realm=realmFor(principal);
    if(realm.pending.size>=maxPending)throw new Error('Private realm queue capacity exhausted');
    return new Promise((resolve,reject)=>{
      const id=sequence++;
      realm.pending.set(id,{resolve,reject});
      try{realm.worker.postMessage({id,method,args});}
      catch(error){
        realm.pending.delete(id);
        reject(new TypeError('Non-cloneable private arguments'));
      }
    });
  }

  /**
   * Invalidate a principal's original ESM state after session revocation.
   * Any attempt to reuse the same principal without resetting the trusted
   * pool is rejected, preventing a silent sequence-reset replay.
   * @param {string} principal
   * @returns {Promise<void>}
   */
  async function revoke(principal){
    const realm=realms.get(principal);
    if(closed||!realm)throw new TypeError('Principal has no active private realm');
    failed.add(principal);
    await realm.worker.terminate();
  }

  /** @returns {Promise<void>} */
  async function close(){
    closed=true;
    await Promise.all([...realms.values()].map(({worker})=>worker.terminate()));
    realms.clear();
  }

  return {initialize,call,revoke,close};
}

module.exports={createScoPrincipalRealmPool};
