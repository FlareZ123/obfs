'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs/promises');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');

const ROOT=path.join(__dirname,'../examples/sco-selective');
const CANARY='SCO_SELECTIVE_SERVER_ONLY_CANARY_73159';
const SESSION_CALLS=200000;

/** @param {import('node:http').Server} server @returns {Promise<number>} */
async function listen(server){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Expected HTTP port');
  return address.port;
}
/** @param {import('node:http').Server} server @returns {Promise<void>} */
async function close(server){
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}
/** @param {number[]} samples @returns {number} */
function median(samples){
  const sorted=[...samples].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * End-to-end SCO selective sample: private source withholding, 20 authorized
 * oracle calls relayed by an attacker-owned server to unauthenticated users,
 * and alternating whole-session overhead compared with native execution.
 * Only a scoped warm Node 22/localhost workload is measured. Browser RTT,
 * TLS, cold startup and distributed execution are outside this experiment.
 * @returns {Promise<{heldOut:number,matched:number,targetUnauthorized:number,servedSourcePrivate:boolean,sessionCalls:number,nativeMedianMs:number,relayMedianMs:number,relayRatio:number}>}
 */
async function runChallenge(){
  const source=await fs.readFile(path.join(ROOT,'before','mixed.mjs'),'utf8');
  const partition=partitionScoSelectedAsyncExports({path:'mixed.mjs',code:source},
    {seed:'sco-selective-20261115-example',privateNames:['protectedDigest']});
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-selective-challenge-'));
  const nativeFetch=globalThis.fetch;
  /** @type {import('node:http').Server|undefined} */
  let target;
  /** @type {import('node:http').Server|undefined} */
  let attacker;
  try{
    await atomicWrite(path.join(directory,'original.mjs'),source);
    await atomicWrite(path.join(directory,'client.mjs'),partition.clientFile.code);
    const original=await import(pathToFileURL(path.join(directory,'original.mjs')).href);
    const client=await import(pathToFileURL(path.join(directory,'client.mjs')).href);
    const token='legitimate-attacker-owned-session';
    const methods=bindScoModuleExports(partition,original);
    let privateCalls=0;
    const guarded=Object.fromEntries(Object.entries(methods).map(([id,fn])=>[
      id,async(...args)=>{privateCalls++;return fn(...args);}
    ]));
    target=http.createServer(createScoHandler([partition.clientFile],{
      remoteMethods:guarded,
      authorizeRead:req=>req.headers['x-demo-session']===token,
      authorizeRpc:req=>req.headers['x-demo-session']===token,
      authorizeOperation:(req,name,args)=>req.headers['x-demo-session']===token &&
        name===partition.methodNames.protectedDigest && args.length===1 &&
        typeof args[0]==='string' && args[0].length<=2048
    }));
    const targetPort=await listen(target);
    const targetOrigin='http://127.0.0.1:'+targetPort;
    const denied=await nativeFetch(targetOrigin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:partition.methodNames.protectedDigest,args:['unapproved']})
    });
    assert.equal(denied.status,403);
    const advertised=await nativeFetch(targetOrigin+'/obfs/mixed.mjs',{
      headers:{'x-demo-session':token}
    });
    assert.equal(advertised.status,200);
    const publicCode=await advertised.text();
    assert.equal(publicCode.includes(CANARY),false);
    assert.equal(publicCode.includes('createHmac'),false);
    assert.equal(publicCode.includes('16000'),false);
    assert.equal(publicCode.includes('export async function protectedDigest'),true);
    // The attacker owns a legitimate token and can replay permitted requests.
    globalThis.fetch=(url,options)=>nativeFetch(new URL(/** @type {string} */(url),targetOrigin),{
      ...options,headers:{...options?.headers,'x-demo-session':token}
    });
    attacker=http.createServer((request,response)=>{
      void(async()=>{
        if(request.method!=='POST'||request.url!=='/clone'){
          response.writeHead(404).end();return;
        }
        let body='';
        for await(const chunk of request){
          body+=chunk.toString();
          if(body.length>4096)throw Error('Request limit exceeded');
        }
        const parsed=JSON.parse(body);
        if(!parsed||typeof parsed.value!=='string'||parsed.value.length>2048)
          throw Error('Invalid clone request');
        const output=await client.combined(parsed.value);
        response.writeHead(200,{'content-type':'application/json'});
        response.end(JSON.stringify({value:output}));
      })().catch(()=>response.writeHead(400).end());
    });
    const attackPort=await listen(attacker);
    const attackUrl='http://127.0.0.1:'+attackPort+'/clone';
    /** @param {string} value @returns {Promise<string>} */
    async function clone(value){
      const res=await nativeFetch(attackUrl,{method:'POST',
        headers:{'content-type':'application/json'},body:JSON.stringify({value})});
      assert.equal(res.status,200);
      return (await res.json()).value;
    }
    let matched=0;
    for(let i=0;i<20;i++){
      const input='unseen-heldout-'+i+'-'+('xy'.repeat(i%7));
      if(await clone(input)===await original.combined(input))matched++;
    }
    assert.equal(matched,20,'Attacker can relay each held-out challenge online');
    assert.equal(privateCalls,20,'Private executions originate from authorized relay requests');
    /** @param {number} n @param {(value:number)=>number} score @returns {number} */
    function publicKernel(n,score){
      let result=0;
      for(let i=0;i<n;i++)result=(result^score(i))|0;
      return result;
    }
    const nativeTimes=[];
    const relayTimes=[];
    for(let trial=0;trial<8;trial++){
      for(const mode of trial%2?['relay','native']:['native','relay']){
        const start=performance.now();
        const digest=publicKernel(SESSION_CALLS,mode==='relay'?client.fastScore:original.fastScore);
        const output=mode==='relay'?await clone('session-fixed-15'):await original.combined('session-fixed-15');
        assert.equal(typeof output,'string');
        assert.equal(digest,publicKernel(SESSION_CALLS,original.fastScore));
        (mode==='relay'?relayTimes:nativeTimes).push(performance.now()-start);
      }
    }
    const result={heldOut:20,matched,targetUnauthorized:denied.status,
      servedSourcePrivate:!publicCode.includes(CANARY),sessionCalls:SESSION_CALLS,
      nativeMedianMs:median(nativeTimes),relayMedianMs:median(relayTimes),
      relayRatio:median(relayTimes)/median(nativeTimes)};
    assert.ok(result.relayRatio<2.5,'Selected sample exceeds the project compute budget');
    return result;
  }finally{
    globalThis.fetch=nativeFetch;
    if(attacker)await close(attacker);
    if(target)await close(target);
    await fs.rm(directory,{recursive:true,force:true});
  }
}

if(require.main===module)runChallenge().then(result=>{
  console.log(JSON.stringify(result,null,2));
}).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={runChallenge};
