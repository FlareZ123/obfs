'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');

const ROOT=path.join(__dirname,'../examples/sco-private-graph');
const TOKEN='legitimate-attacker-owned-session';

/**
 * @param {import('node:http').Server} server
 * @returns {Promise<number>}
 */
async function listen(server){
  /** @type {Promise<void>} */
  const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await ready;
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Expected listening TCP port');
  return address.port;
}

/**
 * @param {import('node:http').Server} server
 * @returns {Promise<void>}
 */
async function close(server){
  /** @type {Promise<void>} */
  const closed=new Promise((resolve,reject)=>
    server.close(error=>error?reject(error):resolve()));
  await closed;
}

/**
 * Adversary sees only the public client and owns a legitimate session. They
 * can proxy arbitrary allowed requests through the real server, despite not
 * knowing the secret HMAC implementation. This is a functional online relay,
 * not private code reconstruction. Native original is used only to check the
 * held-out answers.
 * @returns {Promise<{
 *   privateSourceWithheld:boolean,unauthorizedStatus:number,
 *   privateFileStatus:number,heldOut:number,matched:number,privateCalls:number
 * }>}
 */
async function runAttack(){
  const source=await fs.readFile(path.join(ROOT,'before/mixed.mjs'),'utf8');
  const privateSource=await fs.readFile(path.join(ROOT,'before/private/engine.mjs'),'utf8');
  const publicSource=await fs.readFile(path.join(ROOT,'after/mixed.mjs'),'utf8');
  const compiled=partitionScoSelectedAsyncExports({path:'mixed.mjs',code:source,sourceType:'module'},{
    seed:'sco-private-graph-20261116',privateNames:['protectedDigest'],
    privateModuleImports:['./private/engine.mjs']
  });
  assert.equal(compiled.clientFile.code.replace(/\r\n/gu,'\n'),publicSource.replace(/\r\n/gu,'\n'));
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-graph-relay-'));
  const nativeFetch=globalThis.fetch;
  /** @type {import('node:http').Server|undefined} */
  let target;
  /** @type {import('node:http').Server|undefined} */
  let proxy;
  try{
    await atomicWrite(path.join(directory,'mixed.mjs'),source);
    await atomicWrite(path.join(directory,'private/engine.mjs'),privateSource);
    await atomicWrite(path.join(directory,'public.mjs'),publicSource);
    const native=await import(pathToFileURL(path.join(directory,'mixed.mjs')).href);
    const client=await import(pathToFileURL(path.join(directory,'public.mjs')).href);
    const originals=bindScoModuleExports(compiled,native);
    let privateCalls=0;
    /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
    const registry=Object.create(null);
    for(const [method,fn] of Object.entries(originals)){
      registry[method]=(...args)=>{privateCalls++;return fn(...args);};
    }
    target=http.createServer(createScoHandler([compiled.clientFile],{
      remoteMethods:registry,
      authorizeRead:req=>req.headers['x-owned-session']===TOKEN,
      authorizeRpc:req=>req.headers['x-owned-session']===TOKEN,
      authorizeOperation:(req,method,args)=>req.headers['x-owned-session']===TOKEN &&
        method===compiled.methodNames.protectedDigest &&
        args.length===1 && typeof args[0]==='string' && args[0].length<=2048
    }));
    const origin='http://127.0.0.1:'+await listen(target);
    const request={method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:compiled.methodNames.protectedDigest,args:['without-session']})};
    const denied=await nativeFetch(origin+'/obfs/rpc',request);
    assert.equal(denied.status,403);
    const privateFile=await nativeFetch(origin+'/obfs/private/engine.mjs',{
      headers:{'x-owned-session':TOKEN}
    });
    assert.equal(privateFile.status,404);
    const publicFile=await nativeFetch(origin+'/obfs/mixed.mjs',{
      headers:{'x-owned-session':TOKEN}
    });
    assert.equal(publicFile.status,200);
    const servedSource=await publicFile.text();
    assert.doesNotMatch(servedSource,/deriveProof|node:crypto|PRIVATE_SECRET|SCO_PRIVATE_MODULE_GRAPH_KEY/u);
    // This controlled source of credentials is the attacker's own legitimate
    // session, not a stolen server secret. The attacker can relay permitted
    // computations for arbitrary downstream consumers.
    globalThis.fetch=(url,options)=>nativeFetch(new URL(String(url),origin),{
      ...options,headers:{...options?.headers,'x-owned-session':TOKEN}
    });
    proxy=http.createServer((req,res)=>{
      void(async()=>{
        if(req.method!=='POST'||req.url!=='/clone'){
          res.writeHead(404).end();return;
        }
        let body='';
        for await(const chunk of req){
          body+=chunk.toString();
          if(body.length>4096)throw Error('Oversized clone input');
        }
        const data=JSON.parse(body);
        if(!data||typeof data.value!=='string'||data.value.length>2048)throw Error('Invalid request');
        const value=await client.combined(data.value);
        res.writeHead(200,{'content-type':'application/json'});
        res.end(JSON.stringify({value}));
      })().catch(()=>res.writeHead(400).end());
    });
    const proxyUrl='http://127.0.0.1:'+await listen(proxy)+'/clone';
    /** @param {string} value @returns {Promise<string>} */
    async function clone(value){
      const response=await nativeFetch(proxyUrl,{method:'POST',
        headers:{'content-type':'application/json'},body:JSON.stringify({value})});
      assert.equal(response.status,200);
      return (await response.json()).value;
    }
    let matched=0;
    for(let i=0;i<30;i++){
      const value=createHash('sha256').update('heldout:'+i).digest('hex');
      if(await clone(value)===await native.combined(value))matched++;
    }
    assert.equal(matched,30,'Authorized online relay must reproduce each held-out answer');
    assert.equal(privateCalls,30,'Every unauthorized downstream clone uses one authorized origin RPC');
    return {privateSourceWithheld:true,unauthorizedStatus:denied.status,
      privateFileStatus:privateFile.status,heldOut:30,matched,privateCalls};
  }finally{
    globalThis.fetch=nativeFetch;
    if(proxy)await close(proxy);
    if(target)await close(target);
    await fs.rm(directory,{recursive:true,force:true});
  }
}

if(require.main===module)runAttack().then(result=>{
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={runAttack};
