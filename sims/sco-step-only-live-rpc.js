'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const esbuild=require('esbuild');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');
const {learnBoundedStepOnly,distinguish,createContinuationClone}=
  require('./sco-step-only-version-space');
const {createFiveStateWorkspace}=require('./sco-step-only-five-state');
const {createTwoStateWeightedWorkspace,learnTwoStateWeightedStepOnly}=
  require('./sco-step-only-two-state-expected');
const {makeIndependentMachine}=require('./sco-sync-independent-distribution');

/**
 * @typedef {Object} HttpTraceEntry
 * @property {string} method
 * @property {string} path
 * @property {string|null} requestContentType
 * @property {string|null} requestCookie
 * @property {string} requestBody
 * @property {string|null} requestCache
 * @property {string|null} requestCredentials
 * @property {number} status
 * @property {string|null} responseContentType
 * @property {string|null} responseCacheControl
 * @property {string|null} responseNosniff
 * @property {string|null} responseContentLength
 * @property {number} responseBytes
 * @property {string} responseSha256
 */

/**
 * Record application-visible HTTP request/response details without consuming
 * the response that the client under test will subsequently read.
 *
 * @param {typeof fetch} nativeFetch
 * @param {HttpTraceEntry[]} trace
 * @param {string} origin
 * @param {string} input
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
async function tracedFetch(nativeFetch,trace,origin,input,options={}){
  const url=new URL(input,origin);
  const requestHeaders=new Headers(options.headers);
  const response=await nativeFetch(url,options);
  const bytes=Buffer.from(await response.clone().arrayBuffer());
  trace.push({
    method:options.method??'GET',
    path:url.pathname,
    requestContentType:requestHeaders.get('content-type'),
    requestCookie:requestHeaders.get('cookie'),
    requestBody:typeof options.body==='string'?options.body:'',
    requestCache:options.cache??null,
    requestCredentials:options.credentials??null,
    status:response.status,
    responseContentType:response.headers.get('content-type'),
    responseCacheControl:response.headers.get('cache-control'),
    responseNosniff:response.headers.get('x-content-type-options'),
    responseContentLength:response.headers.get('content-length'),
    responseBytes:bytes.length,
    responseSha256:createHash('sha256').update(bytes).digest('hex')
  });
  return response;
}


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
 * This local test does not model WAN RTT/TLS or stronger-than-session tokens.
 *
 * @param {number} [states]
 * @param {number} [seed]
 * @param {boolean} [matchedControl]
 * @param {'baseline'|'boundedNine'|'expected'} [twoStatePolicy] Optional weighted two-state public learner.
 * `networkSteps` and `ordinaryControlNetworkSteps` are legacy semantic step-call counts,
 *   not total HTTP request counts; explicit HTTP counters are returned separately.
 * @returns {Promise<{states:number,queries:number,remaining:number,certified:boolean,
 *   sourceDisclosed:boolean,unauthorizedStatus:number,publicResetExport:boolean,
 *   knownContinuationExact:boolean,networkSteps:number,distinctSourceFiles:boolean,
 *   attackerModelCount:number,attackerScanWork:number,attackerEquivalenceChecks:number,
 *   attackerProductPairs:number,attackerElapsedMs:number,ordinaryControlRan:boolean,
 *   ordinaryControlQueries:number,ordinaryControlNetworkSteps:number,ordinaryControlExact:boolean,
 *   ordinaryUnauthorizedStatus:number,ordinaryMinifiedBytes:number,
 *   ordinarySourceBytes:number,attackerTranscriptMatched:boolean,
 *   scoHttpRequests:number,scoRpcRequests:number,scoPublishedBytes:number,scoPublishedSha256:string,
 *   ordinaryControlHttpRequests:number,ordinaryControlRpcRequests:number,
 *   ordinaryPublishedBytes:number,ordinaryPublishedSha256:string,
 *   httpRequestCountMatched:boolean,httpRequestShapeMatched:boolean,
 *   rpcResponseTraceMatched:boolean,sourceDeliveryMetadataMatched:boolean,
 *   httpApplicationTraceMatched:boolean,
 *   attackerPolicy:'baseline'|'boundedNine'|'expected',
 *   attackerCandidateBytes:number,attackerWorkspaceInitializationMs:number}>}
 */
async function runLiveStepVersionSpace(states=2,seed=0x31415926,matchedControl=false,twoStatePolicy='baseline'){
  if(!Number.isSafeInteger(states)||states<2||states>5||
      !Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||
      typeof matchedControl!=='boolean' ||
      (twoStatePolicy!=='baseline'&&twoStatePolicy!=='boundedNine'&&twoStatePolicy!=='expected') ||
      (twoStatePolicy!=='baseline'&&states!==2) ||
      (matchedControl&&states!==4&&states!==5&&!(states===2&&twoStatePolicy!=='baseline'))){
    throw new RangeError('Expected valid state count, seed, and two-state-only weighted control');
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
  /** @type {HttpTraceEntry[]} */
  const scoHttpTrace=[];
  /** @type {HttpTraceEntry[]} */
  const ordinaryHttpTrace=[];
  let scoPublishedBytes=0,scoPublishedSha256='';
  let ordinaryPublishedBytes=0,ordinaryPublishedSha256='';
  let httpRequestCountMatched=false,httpRequestShapeMatched=false;
  let rpcResponseTraceMatched=false,sourceDeliveryMetadataMatched=false;
  let httpApplicationTraceMatched=false;
  /** @type {{step:(symbol:number)=>Promise<number>,reset?:unknown}|null} */
  let ordinaryApi=null;
  /** @type {{step:(symbol:number)=>number}|null} */
  let ordinaryClone=null;
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
    const read=await tracedFetch(nativeFetch,scoHttpTrace,origin,origin+'/obfs/client.mjs');
    assert.equal(read.status,200);
    const published=await read.text();
    scoPublishedBytes=Buffer.byteLength(published);
    scoPublishedSha256=createHash('sha256').update(published).digest('hex');
    const sourceDisclosed=published.includes(canary) ||
      published.includes('privateTable') || published.includes('serverCanary');
    assert.equal(sourceDisclosed,false);
    const publicFile=path.join(root,'public','client.mjs');
    await atomicWrite(publicFile,published);

    const denied=await tracedFetch(nativeFetch,scoHttpTrace,origin,origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:partition.methodNames.step,args:[0]})
    });
    assert.equal(denied.status,403);
    globalThis.fetch=(input,options)=>tracedFetch(nativeFetch,scoHttpTrace,origin,String(input),{
      ...options,headers:{...options?.headers,cookie:'session=approved'}
    });
    const api=/** @type {{step:(symbol:number)=>Promise<number>,reset?:unknown}} */(
      await import(pathToFileURL(publicFile).href));
    assert.equal(api.reset,undefined,'Reset unexpectedly published');

    if(matchedControl){
      const ordinaryMethod=partition.methodNames.step;
      const ordinarySource=[
        'export async function step(symbol){',
        'if(!Number.isInteger(symbol)||symbol<0||symbol>1)throw TypeError("symbol");',
        'const response=await fetch("/obfs/rpc",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({method:'+JSON.stringify(ordinaryMethod)+',args:[symbol]})});',
        'const payload=await response.json();',
        'if(!response.ok||!payload||payload.ok!==true)throw Error("Remote operation failed");',
        'return payload.value;',
        '}'
      ].join('');
      const minified=await esbuild.transform(ordinarySource,{format:'esm',minify:true});
      ordinarySourceBytes=Buffer.byteLength(ordinarySource);
      ordinaryMinifiedBytes=Buffer.byteLength(minified.code);
      const ordinaryHandler=http.createServer((request,response)=>{
        const pathname=new URL(request.url??'/','http://localhost').pathname;
        if(request.method==='GET'&&pathname==='/obfs/client.mjs'){
          response.writeHead(200,{
            'content-type':'text/javascript; charset=utf-8',
            'cache-control':'no-store',
            'x-content-type-options':'nosniff'
          });
          response.end(minified.code);
          return;
        }
        if(request.method!=='POST'||pathname!=='/obfs/rpc'){
          response.writeHead(404).end();
          return;
        }
        /**
         * @param {number} status
         * @param {Record<string,unknown>} payload
         */
        const respondJson=(status,payload)=>{
          const body=JSON.stringify(Object.assign(Object.create(null),payload));
          response.writeHead(status,{
            'content-type':'application/json; charset=utf-8',
            'cache-control':'no-store',
            'x-content-type-options':'nosniff'
          });
          response.end(body);
        };
        if(request.headers.cookie!=='session=approved'){
          respondJson(403,{ok:false,error:'Forbidden'});
          return;
        }
        const mediaType=String(request.headers['content-type']||'')
          .split(';',1)[0].trim().toLowerCase();
        if(mediaType!=='application/json'){
          respondJson(415,{ok:false,error:'Expected JSON'});
          return;
        }
        let body='';
        let tooLarge=false;
        request.setEncoding('utf8');
        request.on('data',/** @param {string} chunk */(chunk)=>{
          body+=chunk;
          if(Buffer.byteLength(body)>65536)tooLarge=true;
        });
        request.on('end',()=>{
          if(tooLarge){
            respondJson(413,{ok:false,error:'Request too large'});
            return;
          }
          /** @type {unknown} */
          let parsed;
          try{
            parsed=JSON.parse(body);
          }catch{
            respondJson(400,{ok:false,error:'Malformed JSON'});
            return;
          }
          if(!parsed||typeof parsed!=='object'||
              !Object.hasOwn(parsed,'method')||!Object.hasOwn(parsed,'args')){
            respondJson(400,{ok:false,error:'Unknown method or invalid arguments'});
            return;
          }
          const payload=/** @type {{method?:unknown,args?:unknown}} */(parsed);
          if(typeof payload.method!=='string'||payload.method!==ordinaryMethod||
              !Array.isArray(payload.args)){
            respondJson(400,{ok:false,error:'Unknown method or invalid arguments'});
            return;
          }
          const args=payload.args;
          if(args.length!==1||typeof args[0]!=='number'||
              !Number.isInteger(args[0])||args[0]<0||args[0]>1){
            respondJson(403,{ok:false,error:'Forbidden'});
            return;
          }
          const symbol=args[0];
          const previous=ordinaryCurrent;
          ordinaryCurrent=machine.next[previous][symbol];
          respondJson(200,{ok:true,value:machine.output[previous][symbol]});
        });
      });
      ordinaryServer=ordinaryHandler;
      /** @type {Promise<void>} */
      const ordinaryReady=new Promise((resolve,reject)=>{
        ordinaryHandler.once('error',reject);
        ordinaryHandler.listen(0,'127.0.0.1',()=>resolve());
      });
      await ordinaryReady;
      const ordinaryAddress=ordinaryHandler.address();
      assert.ok(ordinaryAddress&&typeof ordinaryAddress==='object');
      ordinaryOrigin='http://127.0.0.1:'+ordinaryAddress.port;
      const ordinaryRead=await tracedFetch(
        nativeFetch,ordinaryHttpTrace,ordinaryOrigin,ordinaryOrigin+'/obfs/client.mjs');
      assert.equal(ordinaryRead.status,200);
      const ordinaryPublished=await ordinaryRead.text();
      ordinaryPublishedBytes=Buffer.byteLength(ordinaryPublished);
      ordinaryPublishedSha256=createHash('sha256').update(ordinaryPublished).digest('hex');
      assert.equal(ordinaryPublished,minified.code,'Ordinary minified client was not served unchanged');
      const ordinaryFile=path.join(root,'ordinary','client.mjs');
      await atomicWrite(ordinaryFile,ordinaryPublished);
      const deniedOrdinary=await tracedFetch(
        nativeFetch,ordinaryHttpTrace,ordinaryOrigin,ordinaryOrigin+'/obfs/rpc',{
          method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({method:ordinaryMethod,args:[0]})
        });
      ordinaryUnauthorizedStatus=deniedOrdinary.status;
      assert.equal(ordinaryUnauthorizedStatus,403);
      globalThis.fetch=(input,options)=>tracedFetch(
        nativeFetch,ordinaryHttpTrace,ordinaryOrigin,String(input),{
          ...options,headers:{...options?.headers,cookie:'session=approved'}
        });
      ordinaryApi=/** @type {{step:(symbol:number)=>Promise<number>,reset?:unknown}} */(
        await import(pathToFileURL(ordinaryFile).href));
      assert.equal(ordinaryApi.reset,undefined,'Ordinary client unexpectedly exports reset');
    }

    globalThis.fetch=(input,options)=>tracedFetch(nativeFetch,scoHttpTrace,origin,String(input),{
      ...options,headers:{...options?.headers,cookie:'session=approved'}
    });
    /** @type {import('./sco-step-only-five-state').FiveStateWorkspace|undefined} */
    const fiveStateWorkspace=states===5?createFiveStateWorkspace():undefined;
    const twoStateWorkspace=twoStatePolicy==='baseline'?undefined:createTwoStateWeightedWorkspace();
    /**
     * @param {{step:(symbol:number)=>Promise<number>}} publicApi
     * @returns {Promise<Awaited<ReturnType<typeof learnBoundedStepOnly>> |
     *   (Awaited<ReturnType<typeof learnTwoStateWeightedStepOnly>> & {
     *     scanWork:number,equivalenceChecks:number,productPairs:number,
     *     elapsedMs:number,candidateBytes:number,workspaceInitializationMs:number})>}
     */
    const learn=async publicApi=>{
      if(twoStatePolicy==='baseline')return learnBoundedStepOnly(publicApi,states,128,fiveStateWorkspace);
      const weighted=await learnTwoStateWeightedStepOnly(publicApi,twoStatePolicy,twoStateWorkspace);
      return {...weighted,scanWork:0,equivalenceChecks:0,productPairs:0,
        elapsedMs:0,candidateBytes:0,workspaceInitializationMs:0};
    };
    const result=await learn(api);
    assert.equal(result.certified,true);
    assert.ok(result.clone);
    let privateCurrent=0;
    for(const symbol of result.inputs)privateCurrent=machine.next[privateCurrent][symbol];
    const independentTrueContinuation={
      next:machine.next,output:machine.output,state:privateCurrent
    };
    assert.equal(distinguish(result.clone,independentTrueContinuation),null);

    if(ordinaryApi){
      globalThis.fetch=(input,options)=>tracedFetch(nativeFetch,ordinaryHttpTrace,ordinaryOrigin,String(input),{
        ...options,headers:{...options?.headers,cookie:'session=approved'}
      });
      const ordinaryResult=await learn(ordinaryApi);
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
      globalThis.fetch=(input,options)=>tracedFetch(nativeFetch,scoHttpTrace,origin,String(input),{
        ...options,headers:{...options?.headers,cookie:'session=approved'}
      });
      const actual=await api.step(symbol);
      assert.equal(actual,predicted);
      if(ordinaryApi&&ordinaryClone){
        const ordinaryPredicted=ordinaryClone.step(symbol);
        globalThis.fetch=(input,options)=>tracedFetch(nativeFetch,ordinaryHttpTrace,ordinaryOrigin,String(input),{
          ...options,headers:{...options?.headers,cookie:'session=approved'}
        });
        const ordinaryActual=await ordinaryApi.step(symbol);
        assert.equal(ordinaryActual,ordinaryPredicted);
        assert.equal(ordinaryActual,actual);
      }
    }
    if(matchedControl){
      const scoRpc=scoHttpTrace.filter(entry=>entry.path==='/obfs/rpc');
      const ordinaryRpc=ordinaryHttpTrace.filter(entry=>entry.path==='/obfs/rpc');
      const scoSource=scoHttpTrace.find(entry=>entry.method==='GET'&&entry.path==='/obfs/client.mjs');
      const ordinarySource=ordinaryHttpTrace.find(
        entry=>entry.method==='GET'&&entry.path==='/obfs/client.mjs');
      httpRequestCountMatched=scoHttpTrace.length===ordinaryHttpTrace.length &&
        scoRpc.length===ordinaryRpc.length;
      httpRequestShapeMatched=httpRequestCountMatched&&scoHttpTrace.every((entry,index)=>{
        const other=ordinaryHttpTrace[index];
        return entry.method===other.method&&entry.path===other.path&&
          entry.requestContentType===other.requestContentType&&
          entry.requestCookie===other.requestCookie&&entry.requestBody===other.requestBody&&
          entry.requestCache===other.requestCache&&
          entry.requestCredentials===other.requestCredentials;
      });
      rpcResponseTraceMatched=scoRpc.length===ordinaryRpc.length&&scoRpc.every((entry,index)=>{
        const other=ordinaryRpc[index];
        return entry.status===other.status&&
          entry.responseContentType===other.responseContentType&&
          entry.responseCacheControl===other.responseCacheControl&&
          entry.responseNosniff===other.responseNosniff&&
          entry.responseContentLength===other.responseContentLength&&
          entry.responseBytes===other.responseBytes&&
          entry.responseSha256===other.responseSha256;
      });
      sourceDeliveryMetadataMatched=Boolean(scoSource&&ordinarySource)&&
        scoSource.status===ordinarySource.status&&
        scoSource.responseContentType===ordinarySource.responseContentType&&
        scoSource.responseCacheControl===ordinarySource.responseCacheControl&&
        scoSource.responseNosniff===ordinarySource.responseNosniff;
      httpApplicationTraceMatched=httpRequestShapeMatched&&
        rpcResponseTraceMatched&&sourceDeliveryMetadataMatched;
      assert.equal(httpRequestCountMatched,true);
      assert.equal(httpRequestShapeMatched,true);
      assert.equal(rpcResponseTraceMatched,true);
      assert.equal(sourceDeliveryMetadataMatched,true);
      assert.equal(httpApplicationTraceMatched,true);
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
      ordinaryMinifiedBytes,ordinarySourceBytes,attackerTranscriptMatched,
      scoHttpRequests:scoHttpTrace.length,
      scoRpcRequests:scoHttpTrace.filter(entry=>entry.path==='/obfs/rpc').length,
      scoPublishedBytes,scoPublishedSha256,
      ordinaryControlHttpRequests:ordinaryHttpTrace.length,
      ordinaryControlRpcRequests:ordinaryHttpTrace.filter(entry=>entry.path==='/obfs/rpc').length,
      ordinaryPublishedBytes,ordinaryPublishedSha256,
      httpRequestCountMatched,httpRequestShapeMatched,rpcResponseTraceMatched,
      sourceDeliveryMetadataMatched,httpApplicationTraceMatched,
      attackerPolicy:twoStatePolicy
    };
  }finally{
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
