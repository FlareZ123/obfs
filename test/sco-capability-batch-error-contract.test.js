'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {
  createScoHandler,partitionScoAsyncModule,bindScoModuleExports,
  createScoCapabilityScope,createScoPrivateHandles
}=require('../src');

test('SCO pre-authorized batch does not emulate serial partial progress on an invalid item',{
  timeout:30000
},async()=>{
  const source=[
    'const store=globalThis.__SCO_PARTIAL_BATCH_HANDLES__;',
    "const canary='batch-state-private-source';",
    'function next(record,x){record.count++;return record.count+x;}',
    'export async function begin(){return store.issue({count:0});}',
    'export async function step(token,x){',
    ' return store.use(token,record=>next(record,x));',
    '}',
    'export async function batch(token,values){',
    ' return store.use(token,record=>values.map(x=>next(record,x)));',
    '}',
    'export async function position(token){return store.use(token,record=>record.count);}',
    'export async function close(token){return store.revoke(token);}'
  ].join('\n');
  const globals=/** @type {Record<string,unknown>} */ (/** @type {unknown} */ (globalThis));
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sco-capability-batch-contract-'));
  const nativeFetch=globalThis.fetch;
  const scope=createScoCapabilityScope(request=>
    request.headers['x-test-session']==='verified-A'?'account-A':'unverified');
  const store=createScoPrivateHandles(scope.currentPrincipal);
  /** @type {http.Server|undefined} */let server;
  try{
    const privatePath=path.join(root,'private.mjs');
    await atomicWrite(privatePath,source);
    globals.__SCO_PARTIAL_BATCH_HANDLES__=store;
    const original=await import(pathToFileURL(privatePath).href);
    delete globals.__SCO_PARTIAL_BATCH_HANDLES__;
    const partition=partitionScoAsyncModule({
      path:'public.mjs',sourceType:'module',code:source
    },{seed:'batch-error-boundary-2026-11-17',serverOnlyInitialization:true});
    const method=partition.methodNames;
    let authorizedExecutions=0;
    const remoteMethods=bindScoModuleExports(partition,original);
    /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
    const guarded=Object.create(null);
    for(const [key,fn] of Object.entries(remoteMethods)){
      guarded[key]=(...args)=>{authorizedExecutions++;return fn(...args);};
    }
    server=http.createServer(createScoHandler([partition.clientFile],{
      remoteMethods:guarded,
      publicPaths:['public.mjs'],authorizeRead:()=>true,
      authorizeRpc:request=>request.headers['x-test-session']==='verified-A',
      authorizeOperation:(request,m,args)=>{
        if(request.headers['x-test-session']!=='verified-A')return false;
        if(m===method.begin)return args.length===0;
        if(m===method.position||m===method.close){
          return args.length===1&&typeof args[0]==='string';
        }
        if(m===method.step)return args.length===2&&
          typeof args[0]==='string'&&(args[1]===0||args[1]===1);
        if(m===method.batch)return args.length===2&&
          typeof args[0]==='string'&&Array.isArray(args[1])&&
          args[1].length>=1&&args[1].length<=16&&
          args[1].every(x=>x===0||x===1);
        return false;
      },
      runRpcIsolated:scope.runRpcIsolated
    }));
    const running=server;
    await new Promise(resolve=>running.listen(0,'127.0.0.1',()=>resolve(undefined)));
    const address=running.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    const forbidden=await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:method.begin,args:[]})
    });
    assert.equal(forbidden.status,403);
    const response=await nativeFetch(origin+'/obfs/public.mjs');
    assert.equal(response.status,200);
    const published=await response.text();
    assert.equal(published.includes('batch-state-private-source'),false);
    assert.equal(published.includes('record.count++'),false);
    const servedPath=path.join(root,'client.mjs');
    await atomicWrite(servedPath,published);
    globalThis.fetch=/** @type {typeof fetch} */(async(input,options)=>{
      const headers=new Headers(options?.headers);
      headers.set('x-test-session','verified-A');
      return nativeFetch(new URL(String(input),origin),{...options,headers});
    });
    /** @type {{
     * begin:()=>Promise<string>,
     * step:(token:string,x:number)=>Promise<number>,
     * batch:(token:string,values:number[])=>Promise<number[]>,
     * position:(token:string)=>Promise<number>,
     * close:(token:string)=>Promise<boolean>
     * }} */
    const client=await import(pathToFileURL(servedPath).href);
    const serialHandle=await client.begin();
    const batchHandle=await client.begin();
    const valid=[1,0,1,1,0];
    /** @type {number[]} */const serial=[];
    for(const x of valid)serial.push(await client.step(serialHandle,x));
    assert.deepEqual(await client.batch(batchHandle,valid),serial);
    assert.equal(await client.position(serialHandle),5);
    assert.equal(await client.position(batchHandle),5);
    assert.equal(await client.close(serialHandle),true);
    assert.equal(await client.close(batchHandle),true);

    const serialInvalid=await client.begin();
    const batchInvalid=await client.begin();
    for(const x of valid)await client.step(serialInvalid,x);
    const beforeReject=authorizedExecutions;
    await assert.rejects(client.step(serialInvalid,2),/Remote operation failed/);
    await assert.rejects(client.batch(batchInvalid,[...valid,2,0]),/Remote operation failed/);
    assert.equal(authorizedExecutions,beforeReject,
      'Preauthorization must reject before executing private work');
    const serialPosition=await client.position(serialInvalid);
    const batchPosition=await client.position(batchInvalid);
    assert.equal(serialPosition,5);
    assert.equal(batchPosition,0);
    assert.notEqual(serialPosition,batchPosition,
      'Invalid serial prefix and prevalidated batch are not state-equivalent');
    assert.equal(await client.close(serialInvalid),true);
    assert.equal(await client.close(batchInvalid),true);
    console.log(JSON.stringify({validOutputsMatched:5,
      serialPositionAfterInvalid:serialPosition,batchPositionAfterInvalid:batchPosition,
      invalidCallsDeniedBeforePrivateWork:true,unauthenticatedStatus:403,
      verdict:'batching-not-transparent-for-failing-partial-progress-contract'}));
  }finally{
    globalThis.fetch=nativeFetch;
    delete globals.__SCO_PARTIAL_BATCH_HANDLES__;
    if(server){
      const running=server;
      await new Promise((resolve,reject)=>
        running.close(error=>error?reject(error):resolve(undefined)));
    }
    await fs.rm(root,{recursive:true,force:true});
  }
});
