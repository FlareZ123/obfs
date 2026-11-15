'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');

const ROOT=path.join(__dirname,'../examples/sco-private-const');
const SEED='sco-private-const-20261115';
const TOKEN='attacker-owned-legitimate-demo-credential';
const SESSION_CALLS=100000;

/** @param {import('node:http').Server} server @returns {Promise<number>} */
async function listen(server){
  /** @type {Promise<void>} */
  const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await ready;
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Expected TCP port');
  return address.port;
}

/** @param {import('node:http').Server} server @returns {Promise<void>} */
async function close(server){
  /** @type {Promise<void>} */
  const ended=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await ended;
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @param {number} count @param {(value:string)=>string} normalize @returns {number} */
function publicKernel(count,normalize){
  let sum=0;
  for(let i=0;i<count;i++){
    const value=normalize('   VALUE-'+i+'  ');
    sum=(sum+value.length)|0;
  }
  return sum;
}

/**
 * Independent attacker proxy: the attacker knows only the generated public
 * facade and their own legitimate session credential, not the trusted key.
 * Each held-out answer is relayed through the real private RPC service.
 * Native-vs-relay warm timings deliberately include HTTP on localhost.
 * Cold startup, TLS, non-loopback RTT and arbitrary-call-rate budgets are
 * unmeasured; the ratio is evidence for one profiled workload only.
 *
 * @returns {Promise<{
 *   heldOut:number,matched:number,unauthorizedStatus:number,
 *   publicSourceHasKey:boolean,privateCalls:number,sessionCalls:number,
 *   sourceBytes:number,publicBytes:number,nativeMedianMs:number,
 *   relayMedianMs:number,relayRatio:number,
 *   thinNativeMedianMs:number,thinRelayMedianMs:number,thinRelayRatio:number
 * }>}
 */
async function runChallenge(){
  const source=(await fs.readFile(path.join(ROOT,'before','mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const partition=partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:source
  },{seed:SEED,privateNames:['protectedDigest']});
  const publicCode=partition.clientFile.code;
  assert.equal(publicCode.includes('SCO_SERVER_ONLY_HMAC'),false);
  assert.equal(publicCode.includes('createHmac'),false);
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-private-const-relay-'));
  const nativeFetch=globalThis.fetch;
  /** @type {import('node:http').Server|undefined} */
  let target;
  /** @type {import('node:http').Server|undefined} */
  let attacker;
  try{
    await atomicWrite(path.join(directory,'original.mjs'),source);
    await atomicWrite(path.join(directory,'client.mjs'),publicCode);
    const original=await import(pathToFileURL(path.join(directory,'original.mjs')).href);
    const client=await import(pathToFileURL(path.join(directory,'client.mjs')).href);
    const originalMethod=bindScoModuleExports(partition,original);
    let privateCalls=0;
    /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
    const counted=Object.create(null);
    for(const [name,fn] of Object.entries(originalMethod)){
      counted[name]=(...args)=>{privateCalls++;return fn(...args);};
    }
    target=http.createServer(createScoHandler([partition.clientFile],{
      remoteMethods:counted,
      authorizeRead:req=>req.headers['x-demo-session']===TOKEN,
      authorizeRpc:req=>req.headers['x-demo-session']===TOKEN,
      authorizeOperation:(req,method,args)=>req.headers['x-demo-session']===TOKEN &&
        method===partition.methodNames.protectedDigest &&
        args.length===1 && typeof args[0]==='string'
    }));
    const targetPort=await listen(target);
    const origin='http://127.0.0.1:'+targetPort;
    const denied=await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:partition.methodNames.protectedDigest,args:['no-session']})
    });
    assert.equal(denied.status,403);
    const exposed=await nativeFetch(origin+'/obfs/mixed.mjs',{
      headers:{'x-demo-session':TOKEN}
    });
    assert.equal(exposed.status,200);
    assert.equal(await exposed.text(),publicCode);
    // This credential belongs to the attacker, so proxying to the authorized
    // service is permitted under the explicit unlimited-query threat model.
    globalThis.fetch=(url,options)=>nativeFetch(
      new URL(/** @type {string} */ (url),origin),{
        ...options,headers:{...options?.headers,'x-demo-session':TOKEN}
      }
    );
    attacker=http.createServer((request,response)=>{
      void(async()=>{
        if(request.method!=='POST'||request.url!=='/clone'){
          response.writeHead(404).end();return;
        }
        let body='';
        for await(const chunk of request){
          body+=chunk.toString();
          if(body.length>4096)throw Error('Oversized clone input');
        }
        const parsed=JSON.parse(body);
        if(!parsed||typeof parsed.value!=='string'||parsed.value.length>2048){
          throw Error('Invalid clone request');
        }
        const value=await client.run(parsed.value);
        response.writeHead(200,{'content-type':'application/json'});
        response.end(JSON.stringify({value}));
      })().catch(()=>response.writeHead(400).end());
    });
    const attackerPort=await listen(attacker);
    const attackUrl='http://127.0.0.1:'+attackerPort+'/clone';
    /** @param {string} value @returns {Promise<string>} */
    async function clone(value){
      const response=await nativeFetch(attackUrl,{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({value})
      });
      assert.equal(response.status,200);
      const parsed=await response.json();
      return parsed.value;
    }
    let matched=0;
    for(let index=0;index<20;index++){
      const input=createHash('sha256').update('unseen:'+index).digest('hex');
      if(await clone(input)===await original.run(input))matched++;
    }
    assert.equal(matched,20);
    assert.equal(privateCalls,20);
    /** @type {number[]} */
    const thinNativeTimes=[];
    /** @type {number[]} */
    const thinRelayTimes=[];
    for(let trial=0;trial<8;trial++){
      for(const mode of trial%2?['relay','native']:['native','relay']){
        const start=performance.now();
        const digest=mode==='relay'?
          await clone('fixed-thin-challenge'):
          await original.run('fixed-thin-challenge');
        assert.equal(typeof digest,'string');
        (mode==='relay'?thinRelayTimes:thinNativeTimes).push(performance.now()-start);
      }
    }
    const expected=publicKernel(SESSION_CALLS,original.normalize);
    /** @type {number[]} */
    const nativeTimes=[];
    /** @type {number[]} */
    const relayTimes=[];
    for(let trial=0;trial<8;trial++){
      for(const mode of trial%2?['relay','native']:['native','relay']){
        const start=performance.now();
        const local=publicKernel(SESSION_CALLS,
          mode==='relay'?client.normalize:original.normalize);
        const result=mode==='relay'?
          await clone('fixed-session-challenge'):
          await original.run('fixed-session-challenge');
        assert.equal(local,expected);
        assert.equal(typeof result,'string');
        (mode==='relay'?relayTimes:nativeTimes).push(performance.now()-start);
      }
    }
    const nativeMedianMs=median(nativeTimes);
    const relayMedianMs=median(relayTimes);
    return {heldOut:20,matched,unauthorizedStatus:denied.status,
      publicSourceHasKey:publicCode.includes('SCO_SERVER_ONLY_HMAC'),
      privateCalls,sessionCalls:SESSION_CALLS,sourceBytes:Buffer.byteLength(source),
      publicBytes:Buffer.byteLength(publicCode),nativeMedianMs,relayMedianMs,
      relayRatio:relayMedianMs/nativeMedianMs,
      thinNativeMedianMs:median(thinNativeTimes),
      thinRelayMedianMs:median(thinRelayTimes),
      thinRelayRatio:median(thinRelayTimes)/median(thinNativeTimes)};
  }finally{
    globalThis.fetch=nativeFetch;
    if(attacker)await close(attacker);
    if(target)await close(target);
    await fs.rm(directory,{recursive:true,force:true});
  }
}

if(require.main===module){
  runChallenge().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={runChallenge};
