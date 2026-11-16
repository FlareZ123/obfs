'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');
const {learnBoundedStepOnly,distinguish,createContinuationClone}=
  require('./sco-step-only-version-space');
const {makeIndependentMachine}=require('./sco-sync-independent-distribution');

/**
 * Run a real compiler-generated SCO facade against an authenticated local
 * HTTP service whose stateful model source stays inside the server. Only the
 * generated public module and its authorized step method reach the attacker.
 * Private source and model tables are passed solely to the evaluator.
 *
 * This local test does not model WAN RTT/TLS or stronger-than-session tokens.
 *
 * @param {number} [states]
 * @param {number} [seed]
 * @returns {Promise<{states:number,queries:number,remaining:number,certified:boolean,
 *   sourceDisclosed:boolean,unauthorizedStatus:number,publicResetExport:boolean,
 *   knownContinuationExact:boolean,networkSteps:number,distinctSourceFiles:boolean}>}
 */
async function runLiveStepVersionSpace(states=2,seed=0x31415926){
  if((states!==2&&states!==3)||!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff){
    throw new RangeError('Expected two/three states and unsigned seed');
  }
  const machine=makeIndependentMachine(seed,states);
  const canary='private-version-space-canary-'+seed;
  const originalSource=[
    'const privateTable='+JSON.stringify(machine)+';',
    'const serverCanary='+JSON.stringify(canary)+';',
    'let current=0;',
    'export async function step(symbol){',
    'if(!Number.isInteger(symbol)||symbol<0||symbol>1)throw TypeError("symbol");',
    'const previous=current;',
    'current=privateTable.next[previous][symbol];',
    'return privateTable.output[previous][symbol];',
    '}'
  ].join('\n');
  const partition=partitionScoAsyncModule({
    path:'client.mjs',sourceType:'module',code:originalSource
  },{seed:'sco-step-version-space-'+seed,serverOnlyInitialization:true});
  assert.deepEqual(partition.names,['step']);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-step-version-space-'));
  /** @type {http.Server|null} */
  let server=null;
  const nativeFetch=globalThis.fetch;
  try{
    const privateFile=path.join(root,'private','actual.mjs');
    await atomicWrite(privateFile,originalSource);
    const privateModule=await import(pathToFileURL(privateFile).href);
    const methods=bindScoModuleExports(partition,privateModule);
    const activeServer=http.createServer(createScoHandler([partition.clientFile],{
      remoteMethods:methods,
      authorizeRpc:request=>request.headers.cookie==='session=approved',
      authorizeOperation:(request,method,args)=>
        request.headers.cookie==='session=approved' &&
        method===partition.methodNames.step &&
        args.length===1 && typeof args[0]==='number' && Number.isInteger(args[0]) && args[0]>=0 && args[0]<=1
    }));
    server=activeServer;
    /** @type {Promise<void>} */
    const ready=new Promise((resolve,reject)=>{
      activeServer.once('error',reject);
      activeServer.listen(0,'127.0.0.1',()=>resolve());
    });
    await ready;
    const address=activeServer.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    const read=await nativeFetch(origin+'/obfs/client.mjs');
    assert.equal(read.status,200);
    const published=await read.text();
    const sourceDisclosed=published.includes(canary) ||
      published.includes('privateTable') || published.includes('serverCanary');
    assert.equal(sourceDisclosed,false);
    const publicFile=path.join(root,'public','client.mjs');
    await atomicWrite(publicFile,published);

    const denied=await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:partition.methodNames.step,args:[0]})
    });
    assert.equal(denied.status,403);
    globalThis.fetch=(input,options)=>nativeFetch(new URL(String(input),origin),{
      ...options,headers:{...options?.headers,cookie:'session=approved'}
    });
    const api=/** @type {{step:(symbol:number)=>Promise<number>,reset?:unknown}} */(
      await import(pathToFileURL(publicFile).href));
    assert.equal(api.reset,undefined,'Reset unexpectedly published');
    const result=await learnBoundedStepOnly(api,states,64);
    assert.equal(result.certified,true);
    assert.ok(result.clone);
    let privateCurrent=0;
    for(const symbol of result.inputs)privateCurrent=machine.next[privateCurrent][symbol];
    const independentTrueContinuation={
      next:machine.next,output:machine.output,state:privateCurrent
    };
    assert.equal(distinguish(result.clone,independentTrueContinuation),null);

    const followup=[0,1,1,0,1,0,0,1,1,1,0,0,1,0,1,1];
    const localClone=createContinuationClone(result.clone);
    const predicted=followup.map(symbol=>localClone.step(symbol));
    /** @type {number[]} */
    const actual=[];
    for(const symbol of followup)actual.push(await api.step(symbol));
    assert.deepEqual(actual,predicted);
    return {
      states,queries:result.queries,remaining:result.remaining,certified:result.certified,
      sourceDisclosed,unauthorizedStatus:denied.status,publicResetExport:false,
      knownContinuationExact:true,networkSteps:result.queries+followup.length,
      distinctSourceFiles:privateFile!==publicFile
    };
  }finally{
    globalThis.fetch=nativeFetch;
    if(server){
      const activeServer=server;
      /** @type {Promise<void>} */
      const closed=new Promise((resolve,reject)=>
        activeServer.close(error=>error?reject(error):resolve()));
      await closed;
    }
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module){
  runLiveStepVersionSpace()
    .then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={runLiveStepVersionSpace};
