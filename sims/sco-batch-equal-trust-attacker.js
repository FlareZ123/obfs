'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {createHash,randomBytes,timingSafeEqual}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {transformSync}=require('esbuild');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');
const {ROOT,EXPOSED,build}=require('../examples/application-challenge/sco-build.cjs');
const {externalValue}=require('../examples/application-challenge/sco-server.cjs');

/** @typedef {{name:string,args:number[]}} NamedCall */
/** @typedef {{ok:boolean,value:unknown}} BatchItem */
/** @typedef {{method:string,args:Array<Array<{method:string,args:number[]}>>}} WireBatch */
/** @typedef {{sourceSha256:string,sourceBytes:number,heldout:Array<readonly [number,number]>,outputs:unknown[],cloned:number,wireTraceRecovered:boolean}} AttackResult */

/**
 * Construct an ordinary human-readable, equally server-private HTTP client
 * under the exact same generated private method identifiers. esbuild
 * minification is the only concealment applied to this comparison frontend.
 *
 * @param {string} directMethod
 * @param {string} batchMethod
 * @returns {string}
 */
function ordinaryMinifiedClient(directMethod,batchMethod){
  const src=`
const directMethod=${JSON.stringify(directMethod)};
const batchMethod=${JSON.stringify(batchMethod)};
async function rpc(method,args){
  const response=await fetch('/obfs/rpc',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({method,args})
  });
  const payload=await response.json();
  if(!response.ok||!payload||payload.ok!==true)
    throw Error('Remote operation failed');
  return payload.value;
}
export async function evaluateRemote(seed,count){
  return rpc(directMethod,[...arguments]);
}
export async function batch(calls){
  if(!Array.isArray(calls)||!calls.length||calls.length>1024||
     calls.some(call=>!call||call.name!=='evaluateRemote'||
       !Array.isArray(call.args)))
    throw TypeError('Invalid RPC batch');
  return rpc(batchMethod,[calls.map(call=>({
    method:directMethod,args:call.args
  }))]);
}
`;
  return transformSync(src,{format:'esm',target:'es2022',minify:true}).code;
}

/** @param {number} index @returns {number} */
function heldoutSeed(index){
  return createHash('sha256').update('unseen-sco-batch-call-'+index)
    .digest().readUInt32LE(0);
}

/**
 * Independent client-side trace-and-replay adversary. It receives the
 * published source, target HTTP origin and a valid caller's bearer token.
 * No compiler partition, private source, server method IDs or original
 * function reference is passed to the attacker.
 *
 * A single legitimate batch call reveals the backend request envelope and
 * inner RPC method via the network request the instrumented client sends.
 * The attacker then sends one direct HTTP request for 32 *new* inputs, without
 * invoking the public module a second time.
 *
 * @param {string} source
 * @param {string} origin
 * @param {string} token
 * @param {string} variant
 * @returns {Promise<AttackResult>}
 */
async function traceAndRelay(source,origin,token,variant){
  const rawFetch=globalThis.fetch;
  /** @type {WireBatch|undefined} */
  let wire;
  globalThis.fetch=(input,init)=>{
    const url=new URL(String(input),origin);
    if(url.pathname==='/obfs/rpc'){
      assert.equal(wire,undefined,'Only one discovery request is permitted');
      wire=/** @type {WireBatch} */ (JSON.parse(String(init?.body)));
    }
    const headers=new Headers(init?.headers);
    headers.set('x-batch-token',token);
    return rawFetch(url,{...init,headers});
  };
  try{
    const module=/** @type {{batch:(calls:NamedCall[])=>Promise<BatchItem[]>}} */ (
      await import('data:text/javascript;base64,'+
        Buffer.from(source,'utf8').toString('base64')+'#'+variant));
    assert.equal(typeof module.batch,'function');
    const sample=await module.batch([{name:'evaluateRemote',args:[0x12345678,1]}]);
    assert.equal(sample.length,1);
    assert.equal(sample[0].ok,true);
  }finally{
    globalThis.fetch=rawFetch;
  }
  assert.ok(wire,'Attacker must observe the actual authorized outgoing HTTP request');
  assert.equal(typeof wire.method,'string');
  assert.equal(wire.args.length,1);
  assert.equal(wire.args[0].length,1);
  const innerMethod=wire.args[0][0].method;
  assert.equal(typeof innerMethod,'string');
  /** @type {Array<readonly [number,number]>} */
  const heldout=Array.from({length:32},(_,index)=>
    /** @type {readonly [number,number]} */ ([heldoutSeed(index),1000]));
  assert.equal(heldout.some(([seed])=>seed===0x12345678),false,
    'Held-out work must not reuse the observed sample');
  const replay=await rawFetch(origin+'/obfs/rpc',{
    method:'POST',headers:{'x-batch-token':token,
      'content-type':'application/json'},
    body:JSON.stringify({
      method:wire.method,
      args:[heldout.map(([seed,count])=>({
        method:innerMethod,args:[seed,count]
      }))]
    })
  });
  assert.equal(replay.status,200,'The direct attacker-owned RPC must be authorized');
  const result=/** @type {{ok:boolean,value:BatchItem[]}} */(await replay.json());
  assert.equal(result.ok,true);
  assert.equal(result.value.length,heldout.length);
  for(const item of result.value)assert.equal(item.ok,true);
  return {
    sourceSha256:createHash('sha256').update(source).digest('hex'),
    sourceBytes:Buffer.byteLength(source,'utf8'),heldout,
    outputs:result.value.map(item=>item.value),
    cloned:result.value.length,wireTraceRecovered:true
  };
}

/**
 * Compare the actual compiler-generated facade and an equal-trust ordinary
 * esbuild-minified ESM RPC client. Both share exactly the same original
 * server-only ESM implementation, credential and authorization handler.
 *
 * @returns {Promise<{
 *  source:string,platform:NodeJS.Platform,node:string,
 *  generated:{sourceSha256:string,sourceBytes:number,cloned:number},
 *  ordinaryMinified:{sourceSha256:string,sourceBytes:number,cloned:number},
 *  heldoutOutputsMatched:boolean,oneObservedWireBatchPerVariant:boolean,
 *  limitation:string
 * }>}
 */
async function run(){
  const beforeWindow=globalThis.window;
  /** @type {http.Server|undefined} */
  let server;
  try{
    globalThis.window=/** @type {Window & typeof globalThis} */ (
      /** @type {unknown} */ ({externalValue}));
    const graph=await build();
    const code=await fs.readFile(path.join(ROOT,EXPOSED),'utf8');
    const partition=partitionScoAsyncModule({
      path:EXPOSED,code,sourceType:'module'
    },{
      seed:'sco-batch-equal-trust-20261118',
      serverOnlyInitialization:true,batch:true,maxBatchCalls:1024
    });
    assert.deepEqual(partition.names,['evaluateRemote']);
    assert.ok(partition.batchMethod);
    const original=/** @type {{evaluateRemote:(seed:number,count:number)=>Promise<unknown>}} */(
      await import(pathToFileURL(path.join(ROOT,EXPOSED)).href));
    const registry=bindScoModuleExports(partition,original);
    partition.clientFile.privateModulePaths=[...graph.privatePaths];
    partition.clientFile.privateOriginalDigests=graph.privateSourceDigests.map(
      item=>item.sha256);
    const directMethod=partition.methodNames.evaluateRemote;
    const batchMethod=partition.batchMethod;
    const minified=ordinaryMinifiedClient(directMethod,batchMethod);
    const bearer=randomBytes(24).toString('hex');
    const expectedToken=Buffer.from(bearer,'utf8');
    /** @param {http.IncomingMessage} req @returns {boolean} */
    function authorized(req){
      const actual=Buffer.from(String(req.headers['x-batch-token']??''),'utf8');
      return actual.length===expectedToken.length&&
        timingSafeEqual(actual,expectedToken);
    }
    const originalHandler=createScoHandler([partition.clientFile],{
      publicPaths:[EXPOSED],remoteMethods:registry,maxRpcBytes:262144,
      authorizeRead:authorized,authorizeRpc:authorized,
      authorizeOperation:(req,method,args)=>{
        if(!authorized(req))return false;
        if(method===batchMethod){
          if(args.length!==1||!Array.isArray(args[0])||
              !args[0].length||args[0].length>1024)return false;
          let sum=0;
          for(const call of args[0]){
            if(!call||typeof call!=='object'||call.method!==directMethod||
                !Array.isArray(call.args)||call.args.length!==2||
                typeof call.args[0]!=='number'||!Number.isInteger(call.args[0])||
                call.args[0]<0||call.args[0]>0xffffffff||
                typeof call.args[1]!=='number'||!Number.isInteger(call.args[1])||
                call.args[1]<0||call.args[1]>150000)return false;
            sum+=call.args[1];
            if(sum>1024*1000)return false;
          }
          return true;
        }
        return method===directMethod&&args.length===2&&
          typeof args[0]==='number'&&Number.isInteger(args[0])&&
          args[0]>=0&&args[0]<=0xffffffff&&
          typeof args[1]==='number'&&Number.isInteger(args[1])&&
          args[1]>=0&&args[1]<=150000;
      }
    });
    server=http.createServer((request,response)=>{
      if(request.method==='GET'&&request.url==='/obfs/minified.mjs'){
        if(!authorized(request)){
          response.writeHead(403);response.end();return;
        }
        response.writeHead(200,{
          'content-type':'text/javascript; charset=utf-8',
          'cache-control':'no-store','x-content-type-options':'nosniff'
        });
        response.end(minified);return;
      }
      originalHandler(request,response);
    });
    await new Promise(resolve=>server?.listen(0,'127.0.0.1',()=>resolve(undefined)));
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing loopback listener');
    const origin='http://127.0.0.1:'+address.port;
    const generatedPath='/obfs/'+EXPOSED;
    const minifiedPath='/obfs/minified.mjs';
    assert.equal((await fetch(origin+generatedPath)).status,403);
    assert.equal((await fetch(origin+minifiedPath)).status,403);
    const generatedResponse=await fetch(origin+generatedPath,{
      headers:{'x-batch-token':bearer}
    });
    const minifiedResponse=await fetch(origin+minifiedPath,{
      headers:{'x-batch-token':bearer}
    });
    assert.equal(generatedResponse.status,200);
    assert.equal(minifiedResponse.status,200);
    const generated=await generatedResponse.text();
    const servedMinified=await minifiedResponse.text();
    assert.equal(servedMinified,minified);
    assert.ok(!generated.includes('createEngine'));
    assert.ok(!minified.includes('createEngine'));
    const generatedAttack=await traceAndRelay(generated,origin,bearer,'compiled');
    const minifierAttack=await traceAndRelay(minified,origin,bearer,'ordinary');
    assert.deepEqual(generatedAttack.heldout,minifierAttack.heldout);
    assert.equal(generatedAttack.cloned,32);
    assert.equal(minifierAttack.cloned,32);
    const baseline=await Promise.all(generatedAttack.heldout.map(
      async ([seed,count])=>await original.evaluateRemote(seed,count)));
    const expectedJson=JSON.stringify(baseline);
    assert.equal(JSON.stringify(generatedAttack.outputs),expectedJson);
    assert.equal(JSON.stringify(minifierAttack.outputs),expectedJson);
    return {
      source:'sims/sco-batch-equal-trust-attacker.js',
      platform:process.platform,node:process.version,
      generated:{
        sourceSha256:generatedAttack.sourceSha256,
        sourceBytes:generatedAttack.sourceBytes,cloned:generatedAttack.cloned
      },
      ordinaryMinified:{
        sourceSha256:minifierAttack.sourceSha256,
        sourceBytes:minifierAttack.sourceBytes,cloned:minifierAttack.cloned
      },
      heldoutOutputsMatched:true,oneObservedWireBatchPerVariant:true,
      limitation:'Attacker controls a credentialed client and observes one real outgoing batch before direct replay. This establishes bounded online-relay equivalence for two matched-trust frontends, not private source extraction or full JavaScript semantic equivalence.'
    };
  }finally{
    if(server){
      const active=server;
      await new Promise((resolve,reject)=>active.close(
        error=>error?reject(error):resolve(undefined)));
    }
    if(beforeWindow===undefined)Reflect.deleteProperty(globalThis,'window');
    else globalThis.window=beforeWindow;
  }
}
if(require.main===module)run().then(value=>{
  process.stdout.write('SCO_BATCH_EQUAL_TRUST '+JSON.stringify(value)+'\n');
}).catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
module.exports={run,traceAndRelay,ordinaryMinifiedClient};
