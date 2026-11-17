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
 *   call:(principal:string,method:string,args:unknown[])=>Promise<unknown>,
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
  const maxPrincipals=options.maxPrincipals??32;
  const maxPending=options.maxPendingPerPrincipal??64;
  if(!Number.isSafeInteger(maxPrincipals)||maxPrincipals<1||
     !Number.isSafeInteger(maxPending)||maxPending<1){
    throw new TypeError('Expected positive safe realm and queue capacity limits');
  }
  const entryUrl=pathToFileURL(absoluteEntryPath).href;
  /** @type {Map<string,{worker:Worker,pending:Map<number,{
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
    if(realms.size>=maxPrincipals)throw new Error('SCO realm capacity exhausted');
    const worker=new Worker(__filename,{
      workerData:{scoRealmWorker:true,entryUrl,allowedMethods},
      // Worker environment is a *copy*; the principal is trusted server data.
      env:{...process.env,SCO_REALM_PRINCIPAL:principal}
    });
    /** @type {Map<number,{resolve:(value:unknown)=>void,reject:(reason:Error)=>void}>} */
    const pending=new Map();
    const realm={worker,pending};
    realms.set(principal,realm);
    worker.on('message',message=>{
      const request=pending.get(message.id);
      if(!request)return;
      pending.delete(message.id);
      if(message.ok===true)request.resolve(message.value);
      else request.reject(new Error('Private operation failed'));
    });
    worker.on('exit',()=>{
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
   * @param {string} principal
   * @param {string} method
   * @param {unknown[]} args
   * @returns {Promise<unknown>}
   */
  async function call(principal,method,args){
    if(closed||typeof principal!=='string'||!principal||principal.length>256||
       !allowedMethods.includes(method)||!Array.isArray(args)){
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

  /** @returns {Promise<void>} */
  async function close(){
    closed=true;
    await Promise.all([...realms.values()].map(({worker})=>worker.terminate()));
    realms.clear();
  }

  return {call,close};
}

module.exports={createScoPrincipalRealmPool};
