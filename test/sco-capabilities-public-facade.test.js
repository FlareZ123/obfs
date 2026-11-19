'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {
  createScoHandler,partitionScoAsyncModule,bindScoModuleExports,
  createScoCapabilityScope,createScoPrivateHandles
}=require('../src');

/** @typedef {{begin:()=>Promise<string>,step:(handle:string,input:string)=>Promise<string>,close:(handle:string)=>Promise<boolean>}} PrivateApi */

const privateSource=[
 "import {createHmac} from 'node:crypto';",
 'const handles=globalThis.__SCO_CAPABILITY_TEST_HANDLES__;',
 "const secret='server-only-state-key-never-published';",
 'export async function begin(){return handles.issue({step:0,key:secret});}',
 'export async function step(handle,input){',
 " if(typeof input!=='string')throw TypeError('Invalid input');",
 ' return handles.use(handle,state=>{',
 '  state.step++;',
 "  return createHmac('sha256',state.key).update(state.step+':'+input).digest('hex');",
 ' });',
 '}',
 'export async function close(handle){return handles.revoke(handle);}'
].join('\n');

const sessionA=randomBytes(32).toString('hex');
const sessionB=randomBytes(32).toString('hex');

/** @param {string} session @returns {import('node:http').IncomingMessage} */
function fakeRequest(session){
 return /** @type {import('node:http').IncomingMessage} */ (
   /** @type {unknown} */ ({headers:{'x-test-session':session}}));
}

/** @param {import('node:http').IncomingMessage} request @returns {string|undefined} */
function verifiedAccount(request){
 const credential=request.headers['x-test-session'];
 if(credential===sessionA)return 'account-A';
 if(credential===sessionB)return 'account-B';
 return undefined;
}

/** @param {import('node:http').Server} server @returns {Promise<number>} */
async function listen(server){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
 const address=server.address();
 if(!address||typeof address==='string')throw Error('Expected bound TCP server');
 return address.port;
}

/** @param {import('node:http').Server} server @returns {Promise<void>} */
async function close(server){
 await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
}

test('actual SCO partition publishes only RPC facade and preserves private state transitions',{
 timeout:15000
},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sco-capability-generated-'));
 const baseFetch=globalThis.fetch;
 const globals=/** @type {Record<string,unknown>} */(/** @type {unknown} */(globalThis));
 const scope=createScoCapabilityScope(request=>verifiedAccount(request)??'unauthorized');
 const nativeHandles=createScoPrivateHandles(scope.currentPrincipal);
 const remoteHandles=createScoPrivateHandles(scope.currentPrincipal);
 /** @type {http.Server|undefined} */let server;
 try{
  const originalPath=path.join(root,'native.mjs');
  const remotePath=path.join(root,'remote-private.mjs');
  await atomicWrite(originalPath,privateSource);
  await atomicWrite(remotePath,privateSource);
  globals.__SCO_CAPABILITY_TEST_HANDLES__=nativeHandles;
  const original=/** @type {PrivateApi} */ (await import(pathToFileURL(originalPath).href));
  globals.__SCO_CAPABILITY_TEST_HANDLES__=remoteHandles;
  const remote=/** @type {PrivateApi} */ (await import(pathToFileURL(remotePath).href));
  delete globals.__SCO_CAPABILITY_TEST_HANDLES__;

  const partition=partitionScoAsyncModule({path:'public.mjs',sourceType:'module',code:privateSource},{
   seed:'private-capability-test',serverOnlyInitialization:true
  });
  const beginMethod=partition.methodNames.begin;
  const stepMethod=partition.methodNames.step;
  const closeMethod=partition.methodNames.close;
  const allowed=(/** @type {import('node:http').IncomingMessage} */request,
    /** @type {string} */method,/** @type {unknown[]} */args)=>{
   if(!verifiedAccount(request))return false;
   if(method===beginMethod)return args.length===0;
   if(method===stepMethod)return args.length===2&&args.every(x=>typeof x==='string');
   if(method===closeMethod)return args.length===1&&typeof args[0]==='string';
   return false;
  };
  server=http.createServer(createScoHandler([partition.clientFile],{
   remoteMethods:bindScoModuleExports(partition,remote),
   publicPaths:['public.mjs'],authorizeRead:()=>true,
   authorizeRpc:request=>Boolean(verifiedAccount(request)),
   authorizeOperation:allowed,runRpcIsolated:scope.runRpcIsolated
  }));
  const port=await listen(server);
  const origin='http://127.0.0.1:'+port;
  const served=await baseFetch(origin+'/obfs/public.mjs');
  assert.equal(served.status,200);
  const compiled=await served.text();
  assert.ok(!compiled.includes('server-only-state-key-never-published'));
  assert.ok(!compiled.includes('createHmac'));
  assert.ok(!compiled.includes('__SCO_CAPABILITY_TEST_HANDLES__'));
  assert.equal((await baseFetch(origin+'/obfs/remote-private.mjs')).status,404);
  const facadePath=path.join(root,'served.mjs');
  await atomicWrite(facadePath,compiled);
  let activeCredential=sessionA;
  globalThis.fetch=/** @type {typeof fetch} */ (async(input,options)=>{
   const headers=new Headers(options?.headers);
   headers.set('x-test-session',activeCredential);
   return baseFetch(new URL(String(input),origin),{...options,headers});
  });
  const facade=/** @type {PrivateApi} */ (await import(pathToFileURL(facadePath).href));
  /** @type {string} */let nativeHandle='';
  await scope.runRpcIsolated(fakeRequest(activeCredential),async()=>{
   nativeHandle=await original.begin();
  });
  const remoteHandle=await facade.begin();
  assert.match(remoteHandle,/^[A-Za-z0-9_-]{43}$/u);

  activeCredential=sessionB;
  await assert.rejects(facade.step(remoteHandle,'probe'),/Remote operation failed/);
  await assert.rejects(scope.runRpcIsolated(fakeRequest(activeCredential),async()=>{
   await original.step(nativeHandle,'probe');
  }),/Invalid private SCO capability/);
  activeCredential=sessionA;
  for(const input of ['one','two','😺 three']){
   let expected='';
   await scope.runRpcIsolated(fakeRequest(activeCredential),async()=>{
    expected=await original.step(nativeHandle,input);
   });
   assert.equal(await facade.step(remoteHandle,input),expected);
  }
  let closed=false;
  await scope.runRpcIsolated(fakeRequest(activeCredential),async()=>{
   closed=await original.close(nativeHandle);
  });
  assert.equal(closed,true);
  assert.equal(await facade.close(remoteHandle),true);
  await assert.rejects(facade.step(remoteHandle,'after-close'),/Remote operation failed/);
 }finally{
  globalThis.fetch=baseFetch;
  delete globals.__SCO_CAPABILITY_TEST_HANDLES__;
  if(server)await close(server);
  await fs.rm(root,{recursive:true,force:true});
 }
});
