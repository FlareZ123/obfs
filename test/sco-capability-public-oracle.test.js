'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {
  createScoHandler,partitionScoAsyncModule,bindScoModuleExports,
  createScoCapabilityScope,createScoPrivateHandles
}=require('../src');
const {makeMachine,privateTrace,learnMachine,learnedTrace}=
  require('../sims/sco-stateful-oracle');

/**
 * An independent public-interface attack against server-private capability
 * state. The learner is reused unchanged from the existing SCO oracle test;
 * it receives only begin/step methods from the served facade. The private
 * model is consulted only after training for verification.
 */
test('fresh server-private handles expose a resettable four-state behavioral oracle',{
  timeout:30000
},async()=>{
  const machine=makeMachine(0x731ab42d);
  const canary='server-private-capability-model-canary';
  const globals=/** @type {Record<string,unknown>} */ (/** @type {unknown} */(globalThis));
  const source=[
    'const handles=globalThis.__SCO_FSM_ORACLE_PRIVATE_HANDLES__;',
    'const model='+JSON.stringify(machine)+';',
    'const canary='+JSON.stringify(canary)+';',
    'export async function begin(){return handles.issue({state:0});}',
    'export async function step(handle,symbol){',
    ' if(symbol!==0&&symbol!==1)throw TypeError("symbol");',
    ' return handles.use(handle,record=>{',
    '  const state=record.state;',
    '  record.state=model.next[state][symbol];',
    '  return model.output[state][symbol];',
    ' });',
    '}',
    'export async function close(handle){return handles.revoke(handle);}'
  ].join('\n');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sco-capability-oracle-'));
  const nativeFetch=globalThis.fetch;
  const scope=createScoCapabilityScope(request=>{
    const session=request.headers['x-fixture-session'];
    if(session==='verified-A')return 'account-A';
    if(session==='verified-B')return 'account-B';
    return 'unauthorized';
  },{maxPendingTotal:128,maxPendingPerPrincipal:32});
  // Keep the production defaults: 256 active handles per principal, 5-minute TTL.
  const handles=createScoPrivateHandles(scope.currentPrincipal);
  /** @type {http.Server|undefined} */let server;
  try{
    const originalPath=path.join(root,'private.mjs');
    await atomicWrite(originalPath,source);
    globals.__SCO_FSM_ORACLE_PRIVATE_HANDLES__=handles;
    const privateModule=await import(pathToFileURL(originalPath).href);
    delete globals.__SCO_FSM_ORACLE_PRIVATE_HANDLES__;
    const partition=partitionScoAsyncModule({
      path:'public.mjs',sourceType:'module',code:source
    },{seed:'capability-public-oracle-2026-11-17',serverOnlyInitialization:true});
    const beginMethod=partition.methodNames.begin;
    const stepMethod=partition.methodNames.step;
    const closeMethod=partition.methodNames.close;
    server=http.createServer(createScoHandler([partition.clientFile],{
      remoteMethods:bindScoModuleExports(partition,privateModule),
      publicPaths:['public.mjs'],authorizeRead:()=>true,
      authorizeRpc:request=>request.headers['x-fixture-session']==='verified-A' ||
        request.headers['x-fixture-session']==='verified-B',
      authorizeOperation:(request,method,args)=>{
        const valid=request.headers['x-fixture-session']==='verified-A' ||
          request.headers['x-fixture-session']==='verified-B';
        return valid && (method===beginMethod && args.length===0 ||
          method===stepMethod && args.length===2 &&
          typeof args[0]==='string' && (args[1]===0 || args[1]===1) ||
          method===closeMethod && args.length===1 && typeof args[0]==='string');
      },
      runRpcIsolated:scope.runRpcIsolated
    }));
    const running=server;
    await new Promise(resolve=>running.listen(0,'127.0.0.1',()=>resolve(undefined)));
    const address=running.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    const publicResponse=await nativeFetch(origin+'/obfs/public.mjs');
    assert.equal(publicResponse.status,200);
    const emitted=await publicResponse.text();
    assert.equal(emitted.includes(canary),false);
    assert.equal(emitted.includes('model.next'),false);
    assert.equal(emitted.includes('model.output'),false);
    const publicSha256=createHash('sha256').update(emitted).digest('hex');
    const servedPath=path.join(root,'served.mjs');
    await atomicWrite(servedPath,emitted);
    const denied=await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:beginMethod,args:[]})
    });
    assert.equal(denied.status,403);
    let credential='verified-A';
    globalThis.fetch=/** @type {typeof fetch} */ (async(input,options)=>{
      const headers=new Headers(options?.headers);
      headers.set('x-fixture-session',credential);
      return nativeFetch(new URL(String(input),origin),{...options,headers});
    });
    /** @type {{begin:()=>Promise<string>,step:(token:string,symbol:number)=>Promise<number>,close:(token:string)=>Promise<boolean>}} */
    const publicApi=await import(pathToFileURL(servedPath).href);
    assert.equal(/** @type {{reset?:unknown}} */ (publicApi).reset,undefined);
    const firstHandle=await publicApi.begin();
    assert.match(firstHandle,/^[A-Za-z0-9_-]{43}$/u);
    credential='verified-B';
    await assert.rejects(publicApi.step(firstHandle,0),/Remote operation failed/);
    credential='verified-A';

    // Attacker can mint a fresh handle to reset the observed private state.
    // The learner never accesses machine, source, privateModule or handles.
    let activeHandle='';
    let actualAttackerRpcCalls=0;
    let revokedTrainingHandles=0;
    const learned=await learnMachine({
      async reset(){
        if(activeHandle){
          assert.equal(await publicApi.close(activeHandle),true);
          actualAttackerRpcCalls++;
          revokedTrainingHandles++;
        }
        activeHandle=await publicApi.begin();
        actualAttackerRpcCalls++;
        return true;
      },
      async step(symbol){
        actualAttackerRpcCalls++;
        return publicApi.step(activeHandle,symbol);
      }
    },4,2);
    assert.equal(learned.machine.access.length,4);
    const usedTrainingWords=new Set(learned.trainingWords);
    let checked=0;
    let unseen=0;
    /** @type {number[][]} */let layer=[[]];
    for(let length=1;length<=10;length++){
      /** @type {number[][]} */const next=[];
      for(const prefix of layer)for(let symbol=0;symbol<2;symbol++){
        const word=[...prefix,symbol];
        next.push(word);
        // Independent ground truth is supplied only to the verifier, after
        // learnMachine has returned its committed transition/output model.
        assert.deepEqual(learnedTrace(learned.machine,word),privateTrace(machine,word));
        if(!usedTrainingWords.has(JSON.stringify(word)))unseen++;
        checked++;
      }
      layer=next;
    }
    assert.equal(checked,2046);
    assert.ok(unseen>0);
    assert.ok(actualAttackerRpcCalls<10000);
    assert.ok(revokedTrainingHandles>0);
    console.log(JSON.stringify({
      model:'four-state-binary-Mealy',publicSha256,
      attackerRpcCalls:actualAttackerRpcCalls,
      abstractLearnerCalls:learned.requests,
      revokedTrainingHandles,defaultPrincipalQuota:256,
      inferredStates:learned.machine.access.length,
      heldoutWords:checked,strictlyUnseenWords:unseen,
      unauthenticatedStatus:denied.status,
      crossAccountRejected:true,sourceCanaryAbsent:true
    }));
  }finally{
    globalThis.fetch=nativeFetch;
    delete globals.__SCO_FSM_ORACLE_PRIVATE_HANDLES__;
    if(server){
      const running=server;
      await new Promise((resolve,reject)=>
        running.close(error=>error?reject(error):resolve(undefined)));
    }
    await fs.rm(root,{recursive:true,force:true});
  }
});
