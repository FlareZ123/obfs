'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {randomBytes,createHash,createHmac}=require('node:crypto');
const {AsyncLocalStorage}=require('node:async_hooks');
const {partitionScoAsyncGraph,createScoGraphHandler}=require('../src/sco-graph');
const {createScoPrincipalRealmPool}=require('../sims/sco-principal-realm-worker');

const fixture=path.join(__dirname,'fixtures','sco-principal-realm');
const entry=path.join(fixture,'private-api.mjs');
const privatePath=path.join(fixture,'private-counter.mjs');

/** @param {http.Server} server @returns {Promise<string>} */
async function listen(server){
  /** @type {Promise<void>} */
  const started=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await started;
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Expected TCP listener');
  return 'http://127.0.0.1:'+address.port;
}
/** @param {http.Server} server @returns {Promise<void>} */
async function stop(server){
  /** @type {Promise<void>} */
  const stopped=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await stopped;
}
/** @param {string} root @param {string} principal @param {number} sequence
 *  @param {string} input @param {number} bytes @returns {string} */
function expectedTag(root,principal,sequence,input,bytes){
  const key=createHmac('sha256',root).update(principal).digest();
  return createHmac('sha256',key).update(String(sequence)).update(input)
    .update(Buffer.alloc(bytes,sequence&255)).digest('hex');
}

test('real compiler-generated SCO facade preserves isolated private ESM state under authenticated HTTP',async()=>{
  const originalSecret=process.env.SCO_REALM_SECRET;
  const root=randomBytes(32).toString('hex');
  process.env.SCO_REALM_SECRET=root;
  const api=fs.readFileSync(entry,'utf8');
  const counter=fs.readFileSync(privatePath,'utf8');
  const graph=partitionScoAsyncGraph([
    {path:'private-api.mjs',code:api,sourceType:'module'},
    {path:'private-counter.mjs',code:counter,sourceType:'module'}
  ],{seed:'principal-realm-fixed-repro-seed',exposedPaths:['private-api.mjs'],
    batch:true,maxBatchCalls:8});
  const publicBytes=graph.clientFiles[0].code;
  const sourceDigests=[api,counter,publicBytes].map(code=>
    createHash('sha256').update(code).digest('hex'));
  const tokenA=randomBytes(16).toString('hex');
  const tokenB=randomBytes(16).toString('hex');
  /** @param {http.IncomingMessage} request @returns {string|null} */
  const identity=request=>{
    if(request.headers.cookie==='session='+tokenA)return 'A';
    if(request.headers.cookie==='session='+tokenB)return 'B';
    return null;
  };
  const context=new AsyncLocalStorage();
  const pool=createScoPrincipalRealmPool(entry,['tick'],{maxPrincipals:2,maxPendingPerPrincipal:8});
  /** @type {(...args:unknown[])=>Promise<unknown>} */
  const tick=async(...args)=>pool.call(context.getStore(),'tick',args);
  const handler=createScoGraphHandler(graph,{
    'private-api.mjs':{tick}
  },{
    authorizeRpc:request=>identity(request)!==null,
    runRpcIsolated:(request,execute)=>context.run(identity(request),execute)
  });
  await Promise.all([pool.initialize('A'),pool.initialize('B')]);
  const server=http.createServer(handler);
  /** @type {http.Server|undefined} */
  let proxy;
  const nativeFetch=global.fetch;
  let origin='';
  try{
    origin=await listen(server);
    const method=graph.partitions['private-api.mjs'].methodNames.tick;
    /** @param {string|null} token @param {unknown[]} args
     *  @param {Record<string,string>} [extra]
     *  @returns {Promise<{status:number,payload:any}>} */
    const rpc=async(token,args,extra={})=>{
      /** @type {Record<string,string>} */
      const headers={'content-type':'application/json',...extra};
      if(token!==null)headers.cookie='session='+token;
      const response=await nativeFetch(origin+'/obfs/rpc',{
        method:'POST',headers,body:JSON.stringify({method,args})
      });
      return {status:response.status,payload:await response.json()};
    };
    const sourceResponse=await nativeFetch(origin+'/obfs/private-api.mjs');
    assert.equal(sourceResponse.status,200);
    const delivered=await sourceResponse.text();
    for(const marker of ['SCO_REALM_SECRET','SCO_REALM_PRINCIPAL','private-counter.mjs','createHmac']){
      assert.equal(delivered.includes(marker),false,'private canary '+marker);
    }
    assert.equal((await nativeFetch(origin+'/obfs/private-counter.mjs')).status,404);
    assert.equal((await rpc(null,[1,'x',0])).status,403);

    // Execute the *served* public code; the patch supplies Node's test cookie,
    // in place of the browser's same-origin cookie jar.
    global.fetch=(target,options)=>nativeFetch(new URL(target instanceof Request?target.url:target,origin),{
      ...options,headers:{...options?.headers,cookie:'session='+tokenA}
    });
    const publicApi=await import('data:text/javascript,'+encodeURIComponent(delivered));
    const a1=await publicApi.tick(1,'same',256);
    const a2=await publicApi.tick(2,'next',256);
    assert.deepEqual([a1.sequence,a2.sequence],[1,2]);
    assert.equal(a1.tag,expectedTag(root,'A',1,'same',256));
    const b1=await rpc(tokenB,[1,'same',256]);
    assert.equal(b1.status,200);
    assert.equal(b1.payload.value.sequence,1);
    assert.equal(b1.payload.value.tag,expectedTag(root,'B',1,'same',256));
    assert.notEqual(a1.tag,b1.payload.value.tag);

    const stale=await rpc(tokenA,[2,'replay',0]);
    assert.equal(stale.status,500);
    assert.equal(stale.payload.error,'Operation failed');
    const overridden=await rpc(tokenA,[3,'claimed-B',0],{'x-account':'B'});
    assert.equal(overridden.status,200);
    assert.equal(overridden.payload.value.tag,expectedTag(root,'A',3,'claimed-B',0));

    // No authentication bypass: an unauthenticated A proxy can nevertheless
    // service downstream clients online using its own legitimate A cookie.
    proxy=http.createServer(async(request,response)=>{
      let body='';
      for await(const chunk of request)body+=chunk.toString();
      const upstream=await nativeFetch(origin+'/obfs/rpc',{
        method:'POST',headers:{'content-type':'application/json',cookie:'session='+tokenA},
        body
      });
      response.writeHead(upstream.status,{'content-type':'application/json'});
      response.end(await upstream.text());
    });
    const proxyOrigin=await listen(proxy);
    const relay=await nativeFetch(proxyOrigin,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method,args:[4,'relay',0]})
    });
    assert.equal(relay.status,200);
    const relayed=await relay.json();
    assert.equal(relayed.value.tag,expectedTag(root,'A',4,'relay',0));
    // Opposing account requests never infer their principal from A's headers.
    const b2=await rpc(tokenB,[2,'B-only',0]);
    assert.equal(b2.status,200);
    assert.equal(b2.payload.value.tag,expectedTag(root,'B',2,'B-only',0));

    // Same-principal racing requests must not both consume sequence 5.
    const pair=await Promise.all([
      rpc(tokenA,[5,'race-left',0]),rpc(tokenA,[5,'race-right',0])
    ]);
    assert.deepEqual(pair.map(result=>result.status).sort(),[200,500]);
    const a6=await rpc(tokenA,[6,'post-race',0]);
    assert.equal(a6.status,200);
    // Compiler-generated multi-module graph batching must retain A's
    // private counter, preserve side-effect order, and surface only results.
    /** @type {Array<{ok:boolean,value:{sequence:number,tag:string}}>} */
    const results=await publicApi.batch([
      {name:'tick',args:[7,'batch-first',0]},
      {name:'tick',args:[8,'batch-second',0]}
    ]);
    assert.deepEqual(results.map(item=>item.ok),[true,true]);
    assert.deepEqual(results.map(item=>item.value.sequence),[7,8]);
    assert.equal(results[1].value.tag,expectedTag(root,'A',8,'batch-second',0));
    await assert.rejects(publicApi.batch([{name:'unregistered',args:[]}]),/Invalid RPC batch/);
    const b3=await rpc(tokenB,[3,'after-A-batch',0]);
    assert.equal(b3.status,200);
    assert.equal(b3.payload.value.tag,expectedTag(root,'B',3,'after-A-batch',0));
    console.log('SCO realm fixture hashes '+JSON.stringify({
      privateApi:sourceDigests[0],privateCounter:sourceDigests[1],
      compilerFacade:sourceDigests[2],servedFacade:createHash('sha256').update(delivered).digest('hex')
    }));
  }finally{
    global.fetch=nativeFetch;
    if(proxy?.listening)await stop(proxy);
    if(server.listening)await stop(server);
    await pool.close();
    if(originalSecret===undefined)delete process.env.SCO_REALM_SECRET;
    else process.env.SCO_REALM_SECRET=originalSecret;
  }
});

test('principal realm direct cache-negative and bounded worker dispatch',async()=>{
  const originalSecret=process.env.SCO_REALM_SECRET;
  const originalPrincipal=process.env.SCO_REALM_PRINCIPAL;
  process.env.SCO_REALM_SECRET=randomBytes(32).toString('hex');
  process.env.SCO_REALM_PRINCIPAL='native';
  const pool=createScoPrincipalRealmPool(entry,['tick'],{maxPrincipals:2});
  try{
    await Promise.all([pool.initialize('A'),pool.initialize('B')]);
    const [a1,a2,b1]=[
      /** @type {{sequence:number,tag:string}} */ (await pool.call('A','tick',[1,'a',0])),
      /** @type {{sequence:number,tag:string}} */ (await pool.call('A','tick',[2,'b',0])),
      /** @type {{sequence:number,tag:string}} */ (await pool.call('B','tick',[1,'a',0]))
    ];
    assert.deepEqual([a1.sequence,a2.sequence,b1.sequence],[1,2,1]);
    await assert.rejects(pool.call('C','tick',[1,'c',0]),/capacity/);
    await assert.rejects(pool.call('A','unknown',[]),/Invalid private realm/);
    await assert.rejects(pool.call('A','tick',[3,()=>0,0]),/Non-cloneable/);
    const {pathToFileURL}=require('node:url');
    const url=pathToFileURL(entry).href;
    const first=await import(url+'?client=first');
    const second=await import(url+'?client=second');
    const nativeA=await first.tick(1,'x',0);
    assert.equal(nativeA.sequence,1);
    await assert.rejects(second.tick(1,'x',0),/Stale private sequence/,
      'different ESM entry URLs still reuse a relative imported module');
    await pool.revoke('A');
    await assert.rejects(pool.call('A','tick',[3,'after-revocation',0]),
      /state reset refused/,'revoked account must never restart its private graph');
  }finally{
    await pool.close();
    if(originalSecret===undefined)delete process.env.SCO_REALM_SECRET;
    else process.env.SCO_REALM_SECRET=originalSecret;
    if(originalPrincipal===undefined)delete process.env.SCO_REALM_PRINCIPAL;
    else process.env.SCO_REALM_PRINCIPAL=originalPrincipal;
  }
});
