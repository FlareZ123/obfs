'use strict';

const assert=require('node:assert/strict');
const {createHash,randomBytes}=require('node:crypto');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');

const PRIVATE_SOURCE=[
  "import {createHmac,randomBytes} from 'node:crypto';",
  'const privateKey=randomBytes(32);',
  'const fixedWork=Buffer.alloc(8*1024*1024,0x5a);',
  'export async function evaluate(challenge){',
  "if(typeof challenge!=='string'||!/^[a-f0-9]{32}$/.test(challenge))throw TypeError('Invalid input');",
  "return createHmac('sha256',privateKey).update('sco-relay-game-v1').update(challenge).update(fixedWork).digest('hex');",
  '}'
].join('\n');

/** @param {string} group @param {number} index @returns {string} */
function challenge(group,index) {
  return createHash('sha256').update(group+'/'+index).digest('hex').slice(0,32);
}

/** @param {number[]} values @returns {number} */
function median(values) {
  return [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
}

/**
 * Serve a real local HTTP server on a random loopback port.
 * @param {http.RequestListener} handler
 * @returns {Promise<{server:http.Server,url:string}>}
 */
async function listen(handler) {
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  return {server,url:'http://127.0.0.1:'+address.port};
}

/**
 * Attacker's online functional clone. Its arguments are only a reachable
 * trusted RPC URL and a legitimate attacker's bearer session. The attacker
 * does not receive the private module, HMAC key, or source.
 *
 * @param {string} rpcUrl
 * @param {string} session
 * @returns {http.RequestListener}
 */
function createAttackRelay(rpcUrl,session) {
  return (request,response)=>{
    if(request.method!=='POST'||request.url!=='/rpc') {
      response.writeHead(404).end();
      return;
    }
    void (async()=>{
      /** @type {Buffer[]} */
      const data=[];
      let bytes=0;
      for await(const chunk of request) {
        bytes+=chunk.length;
        if(bytes>65536){response.writeHead(413).end();return;}
        data.push(chunk);
      }
      const upstream=await fetch(rpcUrl,{
        method:'POST',
        headers:{'content-type':'application/json','x-session':session},
        body:Buffer.concat(data)
      });
      const content=await upstream.text();
      response.writeHead(upstream.status,{'content-type':'application/json','cache-control':'no-store'});
      response.end(content);
    })().catch(()=>{
      if(!response.headersSent)response.writeHead(502).end();
      else response.destroy();
    });
  };
}

/**
 * @param {string} url
 * @param {string} method
 * @param {string} input
 * @param {string} [token]
 * @returns {Promise<{status:number,ok:boolean,value:string|undefined}>}
 */
async function invoke(url,method,input,token) {
  const response=await fetch(url,{
    method:'POST',
    headers:{'content-type':'application/json',...(token?{'x-session':token}:{})},
    body:JSON.stringify({method,args:[input]})
  });
  /** @type {{ok:boolean,value?:string}} */
  const payload=await response.json();
  return {status:response.status,ok:payload.ok,value:payload.value};
}

/**
 * Run an exact online relay cloning experiment for one server-private
 * high-entropy operation. The side-by-side timings are loopback-only.
 *
 * @returns {Promise<object>}
 */
async function experiment() {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-relay-'));
  /** @type {http.Server[]} */
  const servers=[];
  try {
    const sourceFile=path.join(root,'private.mjs');
    await atomicWrite(sourceFile,PRIVATE_SOURCE);
    const nativeModule=await import(pathToFileURL(sourceFile).href);
    const native=/** @type {(input:string)=>Promise<string>} */ (nativeModule.evaluate);
    const partition=partitionScoAsyncModule({
      path:'public.mjs',sourceType:'module',code:PRIVATE_SOURCE
    },{seed:'sco-relay-application-v1',serverOnlyInitialization:true});
    let nativeExecutions=0;
    const instrumented={
      /** @param {string} input @returns {Promise<string>} */
      evaluate:async input=>{nativeExecutions++;return native(input);}
    };
    const methods=bindScoModuleExports(partition,instrumented);
    const token=randomBytes(32).toString('hex');
    const authorize=/** @param {http.IncomingMessage} req */ req=>
      req.headers['x-session']===token;
    const target=await listen(createScoHandler([partition.clientFile],{
      remoteMethods:methods,authorizeRead:authorize,authorizeRpc:authorize,
      authorizeOperation:(request,method,args)=>
        authorize(request)&&method===partition.methodNames.evaluate&&
        args.length===1&&typeof args[0]==='string'&&/^[a-f0-9]{32}$/.test(args[0])
    }));
    servers.push(target.server);
    const trustedRpc=target.url+'/obfs/rpc';
    const readDenied=await fetch(target.url+'/obfs/public.mjs');
    assert.equal(readDenied.status,403);
    const readGranted=await fetch(target.url+'/obfs/public.mjs',{
      headers:{'x-session':token}
    });
    assert.equal(readGranted.status,200);
    const clientSource=await readGranted.text();
    assert.doesNotMatch(clientSource,/privateKey|createHmac|fixedWork/u);
    const method=partition.methodNames.evaluate;
    assert.ok(typeof method==='string');

    const clone=await listen(createAttackRelay(trustedRpc,token));
    servers.push(clone.server);
    const cloneUrl=clone.url+'/rpc';
    const beforeDenied=nativeExecutions;
    const unauthenticated=await invoke(trustedRpc,method,challenge('denied',0));
    assert.equal(unauthenticated.status,403);
    assert.equal(nativeExecutions,beforeDenied);
    const deniedExecutions=nativeExecutions-beforeDenied;

    const seen=Array.from({length:32},(_,i)=>challenge('known',i));
    const held=Array.from({length:32},(_,i)=>challenge('heldout',i));
    /** @type {Map<string,string>} */
    const lookup=new Map();
    for(const input of seen) {
      const allowed=await invoke(trustedRpc,method,input,token);
      assert.equal(allowed.status,200);
      assert.equal(allowed.ok,true);
      assert.ok(allowed.value);
      lookup.set(input,allowed.value);
    }
    const heldLookupHits=held.filter(input=>lookup.has(input)).length;
    assert.equal(heldLookupHits,0);
    let relayMatches=0;
    for(const input of held) {
      const expected=await native(input);
      const proxied=await invoke(cloneUrl,method,input);
      assert.equal(proxied.status,200);
      assert.equal(proxied.value,expected);
      relayMatches++;
    }
    const measureInputs=Array.from({length:12},(_,i)=>challenge('timing',i));
    /** @type {string[]} */
    const expected=[];
    for(const input of measureInputs)expected.push(await native(input));
    /** @type {number[]} */
    const baseline=[],direct=[],relayed=[];
    for(let i=0;i<3;i++){
      await invoke(trustedRpc,method,measureInputs[i],token);
      await invoke(cloneUrl,method,measureInputs[i]);
      await native(measureInputs[i]);
    }
    for(let round=0;round<9;round++) {
      const order=[['native','direct','relay'],['relay','native','direct'],
        ['direct','relay','native']][round%3];
      for(const strategy of order) {
        const t=performance.now();
        /** @type {string[]} */
        const values=[];
        for(const input of measureInputs) {
          if(strategy==='native')values.push(await native(input));
          else {
            const result=await invoke(strategy==='direct'?trustedRpc:cloneUrl,
              method,input,strategy==='direct'?token:undefined);
            assert.equal(result.status,200);
            values.push(/** @type {string} */ (result.value));
          }
        }
        assert.deepEqual(values,expected);
        const elapsed=performance.now()-t;
        if(strategy==='native')baseline.push(elapsed);
        else if(strategy==='direct')direct.push(elapsed);
        else relayed.push(elapsed);
      }
    }
    const nativeMedian=median(baseline);
    const directMedian=median(direct);
    const relayMedian=median(relayed);
    return {
      node:process.version,platform:process.platform,
      privateSourceSha256:createHash('sha256').update(PRIVATE_SOURCE).digest('hex'),
      exposedClientBytes:Buffer.byteLength(clientSource),
      secretKeyBits:256,inputDomainBits:128,
      trainingQueries:seen.length,previouslyUnseenInputs:held.length,
      offlineLookupHeldoutHits:heldLookupHits,
      unauthenticatedDirectStatus:unauthenticated.status,
      unauthorizedExecuted:deniedExecutions,
      exactOnlineRelayMatches:relayMatches,
      nativeMedianMs:nativeMedian,directMedianMs:directMedian,
      relayedMedianMs:relayMedian,directRatio:directMedian/nativeMedian,
      relayedRatio:relayMedian/nativeMedian,
      relayWithin2_5x:relayMedian/nativeMedian<=2.5,
      caveat:'The attacker has an approved unlimited-query session and forwards untrusted downstream requests. This is a functional online clone without private key extraction. No real network RTT, TLS, identity binding, client attestation or anti-relay mechanism is benchmarked.'
    };
  } finally {
    for(const server of servers.reverse())await new Promise(resolve=>server.close(resolve));
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module) {
  experiment().then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={experiment,createAttackRelay};
