'use strict';

const assert=require('node:assert/strict');
const esbuild=require('esbuild');
const fs=require('node:fs/promises');
const http=require('node:http');
const {channel}=require('node:diagnostics_channel');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');
const {learnBoundedStepOnly,distinguish,createContinuationClone}=
  require('./sco-step-only-version-space');
const {createFiveStateWorkspace}=require('./sco-step-only-five-state');
const {makeIndependentMachine}=require('./sco-sync-independent-distribution');

/**
 * Run a real compiler-generated SCO facade against an authenticated local
 * HTTP service whose stateful model source stays inside the server. Only the
 * generated public module and its authorized step method reach the attacker.
 * Private source and model tables are passed solely to the evaluator.
 *
 * An optional matched control is an ordinary Node HTTP step service with the
 * same hidden machine, cookie policy and public method, using an esbuild-
 * minified ESM client. The exact same attacker is run against both arms.
 *
 *
 * IMPORTANT SCOPE LIMIT: this is an in-process query-complexity/API simulation,
 * not a hostile-client isolation boundary. The server, private module and learner
 * share one Node process and UID. The private source is written under a mode-0700
 * temp root owned by that same UID, so hostile code in this process can enumerate
 * the temp directory and read it or instrument the server runtime. The fixed
 * learner function is only passed the public API, but arbitrary attacker code is
 * not isolated from server files/state. Use separate server/client processes and
 * a distinct no-sudo client UID/container for SCO threat-model claims.
 *
 * This local test does not model WAN RTT/TLS or stronger-than-session tokens.
 *
 * @param {number} [states]
 * @param {number} [seed]
 * @param {boolean} [matchedControl]
 * @returns {Promise<{states:number,queries:number,remaining:number,certified:boolean,
 *   sourceDisclosed:boolean,unauthorizedStatus:number,publicResetExport:boolean,
 *   knownContinuationExact:boolean,networkSteps:number,distinctSourceFiles:boolean,
 *   attackerModelCount:number,attackerScanWork:number,attackerEquivalenceChecks:number,
 *   attackerProductPairs:number,attackerElapsedMs:number,ordinaryControlRan:boolean,
 *   ordinaryControlQueries:number,ordinaryControlNetworkSteps:number,ordinaryControlExact:boolean,
 *   ordinaryUnauthorizedStatus:number,ordinaryMinifiedBytes:number,
 *   ordinarySourceBytes:number,attackerTranscriptMatched:boolean,
 *   attackerCandidateBytes:number,attackerWorkspaceInitializationMs:number}>}
 */
async function runLiveStepVersionSpace(states=2,seed=0x31415926,matchedControl=false){
  if(!Number.isSafeInteger(states)||states<2||states>5||
      !Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||
      typeof matchedControl!=='boolean' || (matchedControl&&states!==4&&states!==5)){
    throw new RangeError('Expected two through five states, unsigned seed, and matched control only for four or five states');
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
  /** @type {http.Server|null} */
  let ordinaryServer=null;
  let ordinaryCurrent=0;
  let ordinaryOrigin='';
  let ordinaryQueries=0,ordinaryMinifiedBytes=0,ordinarySourceBytes=0;
  let ordinaryUnauthorizedStatus=0,ordinaryControlExact=false;
  let attackerTranscriptMatched=false;
  /** @type {{step:(symbol:number)=>Promise<number>,reset?:unknown}|null} */
  let ordinaryApi=null;
  /** @type {{step:(symbol:number)=>number}|null} */
  let ordinaryClone=null;
  const nativeFetch=globalThis.fetch;
  const traceEnabled=states===5;
  const traceStart=performance.now();
  /** @param {string} event @param {Record<string,unknown>} [data] */
  const trace=(event,data={})=>{
    if(traceEnabled)console.log('STEP_HTTP_TRACE '+JSON.stringify({ms:Math.round(performance.now()-traceStart),event,...data}));
  };
  /** @param {http.Server} target @param {string} arm */
  function traceServer(target,arm){
    if(!traceEnabled)return;
    trace('server-config',{arm,keepAliveTimeout:target.keepAliveTimeout,requestTimeout:target.requestTimeout});
    target.on('connection',socket=>{
      const port=socket.remotePort;
      trace('server-connection',{arm,port});
      socket.on('timeout',()=>trace('server-socket-timeout',{arm,port}));
      socket.on('close',hadError=>trace('server-socket-close',{arm,port,hadError}));
    });
    target.on('request',(req,res)=>{
      const port=req.socket.remotePort;
      trace('server-request',{arm,port,path:req.url});
      res.on('finish',()=>trace('server-response',{arm,port,status:res.statusCode}));
    });
  }
  const headersChannel=channel('undici:client:sendHeaders');
  const errorChannel=channel('undici:request:error');
  /** @param {unknown} value */
  function onHeaders(value){
    const event=/** @type {{request:{origin:string,path:string},socket:{localPort?:number,remotePort?:number}}} */(value);
    trace('client-send',{origin:event.request.origin,path:event.request.path,localPort:event.socket.localPort,remotePort:event.socket.remotePort});
  }
  /** @param {unknown} value */
  function onError(value){
    const event=/** @type {{request:{origin:string,path:string},error:{code?:string,message?:string}}} */(value);
    trace('client-error',{origin:event.request.origin,path:event.request.path,code:event.error.code,message:event.error.message});
  }
  if(traceEnabled){
    trace('runtime',{node:process.version,undici:process.versions.undici,platform:process.platform});
    headersChannel.subscribe(onHeaders);
    errorChannel.subscribe(onError);
  }
  try{
    const privateFile=path.join(root,'private','actual.mjs');
    await atomicWrite(privateFile,originalSource);
    const privateModule=await import(pathToFileURL(privateFile).href);
    const methods=bindScoModuleExports(partition,privateModule);
    // Both in-process controls share the synchronous learner's event loop.
    // Avoid the default 5s idle expiry racing with a reused local POST socket.
    // This is a test-harness setting, not a production server default.
    const localHttpOptions={keepAliveTimeout:60_000};
    const activeServer=http.createServer(localHttpOptions,createScoHandler([partition.clientFile],{
      remoteMethods:methods,
      authorizeRpc:request=>request.headers.cookie==='session=approved',
      authorizeOperation:(request,method,args)=>
        request.headers.cookie==='session=approved' &&
        method===partition.methodNames.step &&
        args.length===1 && typeof args[0]==='number' && Number.isInteger(args[0]) && args[0]>=0 && args[0]<=1
    }));
    server=activeServer;
    traceServer(activeServer,'generated');
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

    if(matchedControl){
      const ordinaryHandler=http.createServer(localHttpOptions,(request,response)=>{
        if(request.method!=='POST'||request.url!=='/step'){
          response.statusCode=404;response.end();return;
        }
        if(request.headers.cookie!=='session=approved'){
          response.statusCode=403;response.end();return;
        }
        let body='';
        request.setEncoding('utf8');
        request.on('data',/** @param {string} chunk */(chunk)=>{body+=chunk;});
        request.on('end',()=>{
          try{
            const payload=/** @type {{symbol?:unknown}} */(JSON.parse(body));
            const symbol=payload.symbol;
            if(typeof symbol!=='number'||!Number.isInteger(symbol)||symbol<0||symbol>1){
              response.statusCode=400;response.end();return;
            }
            const previous=ordinaryCurrent;
            ordinaryCurrent=machine.next[previous][symbol];
            response.writeHead(200,{'content-type':'application/json'});
            response.end(JSON.stringify({output:machine.output[previous][symbol]}));
          }catch{
            response.statusCode=400;response.end();
          }
        });
      });
      ordinaryServer=ordinaryHandler;
      traceServer(ordinaryHandler,'ordinary');
      /** @type {Promise<void>} */
      const ordinaryReady=new Promise((resolve,reject)=>{
        ordinaryHandler.once('error',reject);
        ordinaryHandler.listen(0,'127.0.0.1',()=>resolve());
      });
      await ordinaryReady;
      const ordinaryAddress=ordinaryHandler.address();
      assert.ok(ordinaryAddress&&typeof ordinaryAddress==='object');
      ordinaryOrigin='http://127.0.0.1:'+ordinaryAddress.port;

      const ordinarySource=[
        'export async function step(symbol){',
        'const response=await fetch("/step",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({symbol})});',
        'if(!response.ok)throw new Error("HTTP "+response.status);',
        'const result=await response.json();',
        'return result.output;',
        '}'
      ].join('');
      const minified=await esbuild.transform(ordinarySource,{format:'esm',minify:true});
      ordinarySourceBytes=Buffer.byteLength(ordinarySource);
      ordinaryMinifiedBytes=Buffer.byteLength(minified.code);
      const ordinaryFile=path.join(root,'ordinary','client.mjs');
      await atomicWrite(ordinaryFile,minified.code);
      const deniedOrdinary=await nativeFetch(ordinaryOrigin+'/step',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({symbol:0})
      });
      ordinaryUnauthorizedStatus=deniedOrdinary.status;
      assert.equal(ordinaryUnauthorizedStatus,403);
      globalThis.fetch=(input,options)=>nativeFetch(new URL(String(input),ordinaryOrigin),{
        ...options,headers:{...options?.headers,cookie:'session=approved'}
      });
      ordinaryApi=/** @type {{step:(symbol:number)=>Promise<number>,reset?:unknown}} */(
        await import(pathToFileURL(ordinaryFile).href));
      assert.equal(ordinaryApi.reset,undefined,'Ordinary client unexpectedly exports reset');
    }

    globalThis.fetch=(input,options)=>nativeFetch(new URL(String(input),origin),{
      ...options,headers:{...options?.headers,cookie:'session=approved'}
    });
    /** @type {import('./sco-step-only-five-state').FiveStateWorkspace|undefined} */
    trace('workspace-start');
    const fiveStateWorkspace=states===5?createFiveStateWorkspace():undefined;
    trace('generated-learner-start');
    const result=await learnBoundedStepOnly(api,states,128,fiveStateWorkspace);
    trace('generated-learner-end',{queries:result.queries});
    assert.equal(result.certified,true);
    assert.ok(result.clone);
    let privateCurrent=0;
    for(const symbol of result.inputs)privateCurrent=machine.next[privateCurrent][symbol];
    const independentTrueContinuation={
      next:machine.next,output:machine.output,state:privateCurrent
    };
    assert.equal(distinguish(result.clone,independentTrueContinuation),null);

    if(ordinaryApi){
      globalThis.fetch=(input,options)=>nativeFetch(new URL(String(input),ordinaryOrigin),{
        ...options,headers:{...options?.headers,cookie:'session=approved'}
      });
      trace('ordinary-learner-start');
      const ordinaryResult=await learnBoundedStepOnly(ordinaryApi,states,128,fiveStateWorkspace);
      trace('ordinary-learner-end',{queries:ordinaryResult.queries});
      assert.equal(ordinaryResult.certified,true);
      assert.ok(ordinaryResult.clone);
      ordinaryQueries=ordinaryResult.queries;
      attackerTranscriptMatched=
        JSON.stringify(result.inputs)===JSON.stringify(ordinaryResult.inputs) &&
        JSON.stringify(result.outputs)===JSON.stringify(ordinaryResult.outputs);
      assert.equal(attackerTranscriptMatched,true);
      assert.equal(ordinaryQueries,result.queries);
      assert.equal(ordinaryCurrent,privateCurrent);
      const ordinaryHidden={next:machine.next,output:machine.output,state:ordinaryCurrent};
      ordinaryControlExact=distinguish(ordinaryResult.clone,ordinaryHidden)===null;
      assert.equal(ordinaryControlExact,true);
      ordinaryClone=createContinuationClone(ordinaryResult.clone);
    }

    const followup=[0,1,1,0,1,0,0,1,1,1,0,0,1,0,1,1];
    const localClone=createContinuationClone(result.clone);
    for(const symbol of followup){
      const predicted=localClone.step(symbol);
      globalThis.fetch=(input,options)=>nativeFetch(new URL(String(input),origin),{
        ...options,headers:{...options?.headers,cookie:'session=approved'}
      });
      const actual=await api.step(symbol);
      assert.equal(actual,predicted);
      if(ordinaryApi&&ordinaryClone){
        const ordinaryPredicted=ordinaryClone.step(symbol);
        globalThis.fetch=(input,options)=>nativeFetch(new URL(String(input),ordinaryOrigin),{
          ...options,headers:{...options?.headers,cookie:'session=approved'}
        });
        const ordinaryActual=await ordinaryApi.step(symbol);
        assert.equal(ordinaryActual,ordinaryPredicted);
        assert.equal(ordinaryActual,actual);
      }
    }
    return {
      states,queries:result.queries,remaining:result.remaining,certified:result.certified,
      sourceDisclosed,unauthorizedStatus:denied.status,publicResetExport:false,
      knownContinuationExact:true,networkSteps:result.queries+followup.length,
      distinctSourceFiles:privateFile!==publicFile,
      attackerModelCount:result.modelCount||0,
      attackerScanWork:result.scanWork||0,
      attackerEquivalenceChecks:result.equivalenceChecks||0,
      attackerProductPairs:result.productPairs||0,
      attackerElapsedMs:result.elapsedMs||0,
      attackerCandidateBytes:result.candidateBytes||0,
      attackerWorkspaceInitializationMs:result.workspaceInitializationMs||0,
      ordinaryControlRan:matchedControl,ordinaryControlQueries:ordinaryQueries,
      ordinaryControlNetworkSteps:matchedControl?ordinaryQueries+followup.length:0,
      ordinaryControlExact,ordinaryUnauthorizedStatus,
      ordinaryMinifiedBytes,ordinarySourceBytes,attackerTranscriptMatched
    };
  }finally{
    if(traceEnabled){headersChannel.unsubscribe(onHeaders);errorChannel.unsubscribe(onError);}
    globalThis.fetch=nativeFetch;
    if(ordinaryServer){
      const activeServer=ordinaryServer;
      /** @type {Promise<void>} */
      const closed=new Promise((resolve,reject)=>
        activeServer.close(error=>error?reject(error):resolve()));
      await closed;
    }
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
