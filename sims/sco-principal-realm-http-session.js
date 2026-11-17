'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {randomBytes,createHash}=require('node:crypto');
const {AsyncLocalStorage}=require('node:async_hooks');
const {partitionScoAsyncGraph,createScoGraphHandler}=require('../src/sco-graph');
const {verifyScoPrivateSourceDigests}=require('../src/sco-private-integrity');
const {createScoPrincipalRealmPool}=require('./sco-principal-realm-worker');

const fixture=path.resolve(__dirname,'../test/fixtures/sco-principal-realm');
const entry=path.join(fixture,'private-api.mjs');
const dependency=path.join(fixture,'private-counter.mjs');

/** @param {number[]} samples @returns {number} */
function median(samples){
  const sorted=[...samples].sort((a,b)=>a-b);
  return (sorted[(sorted.length-1)>>1]+sorted[sorted.length>>1])/2;
}

/** @param {http.Server} server @returns {Promise<string>} */
async function listen(server){
  /** @type {Promise<void>} */
  const listening=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await listening;
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Expected TCP address');
  return 'http://127.0.0.1:'+address.port;
}

/** @param {http.Server} server @returns {Promise<void>} */
async function close(server){
  /** @type {Promise<void>} */
  const done=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await done;
}

/** @param {()=>Promise<unknown>} operation @returns {Promise<{ns:number,value:unknown}>} */
async function measured(operation){
  const start=process.hrtime.bigint();
  const value=await operation();
  return {ns:Number(process.hrtime.bigint()-start),value};
}

async function main(){
  const secret=randomBytes(32).toString('hex');
  const token=randomBytes(24).toString('hex');
  process.env.SCO_REALM_SECRET=secret;
  process.env.SCO_REALM_PRINCIPAL='A';
  const originalCode=fs.readFileSync(entry,'utf8');
  const dependentCode=fs.readFileSync(dependency,'utf8');
  const graph=partitionScoAsyncGraph([
    {path:'private-api.mjs',code:originalCode,sourceType:'module'},
    {path:'private-counter.mjs',code:dependentCode,sourceType:'module'}
  ],{seed:'sco-principal-realm-session-profile',exposedPaths:['private-api.mjs'],
    batch:true,maxBatchCalls:64});
  await verifyScoPrivateSourceDigests(graph,fixture);
  const native=await import(pathToFileURL(entry).href);
  const pool=createScoPrincipalRealmPool(entry,['tick'],{maxPrincipals:1});
  const context=new AsyncLocalStorage();
  /** @type {(...args:unknown[])=>Promise<unknown>} */
  const tick=async(...args)=>pool.call(context.getStore(),'tick',args);
  const handler=createScoGraphHandler(graph,{'private-api.mjs':{tick}},{
    authorizeRpc:request=>request.headers.cookie==='session='+token,
    runRpcIsolated:(request,execute)=>context.run('A',execute)
  });
  let serverDelayMs=0;
  // Controlled artificial per-request delay, measured in the full session.
  // This is not real Internet RTT or a production latency distribution.
  const server=http.createServer((request,response)=>{
    if(serverDelayMs>0&&request.method==='POST'&&request.url==='/obfs/rpc'){
      setTimeout(()=>handler(request,response),serverDelayMs);
    }else handler(request,response);
  });
  const nativeFetch=global.fetch;
  let nativeSequence=0;
  let remoteSequence=0;
  try{
    const initialization=await measured(()=>pool.initialize('A'));
    const origin=await listen(server);
    const codeResponse=await nativeFetch(origin+'/obfs/private-api.mjs');
    assert.equal(codeResponse.status,200);
    const published=await codeResponse.text();
    global.fetch=(target,options)=>nativeFetch(new URL(target instanceof Request?target.url:target,origin),{
      ...options,headers:{...options?.headers,cookie:'session='+token}
    });
    const publishedApi=await import('data:text/javascript,'+encodeURIComponent(published));

    /** @param {number} count @param {number} bytes @param {string} label @returns {Promise<unknown[]>} */
    async function nativeSession(count,bytes,label){
      const output=[];
      for(let i=0;i<count;i++)output.push(await native.tick(++nativeSequence,label+'/'+i,bytes));
      return output;
    }
    /** @param {number} count @param {number} bytes @param {string} label @returns {Promise<unknown[]>} */
    async function remoteSession(count,bytes,label){
      const output=[];
      for(let i=0;i<count;i++)output.push(await publishedApi.tick(++remoteSequence,label+'/'+i,bytes));
      return output;
    }

    /** @param {number} count @param {number} bytes @param {string} label @returns {Promise<unknown[]>} */
    async function batchedSession(count,bytes,label){
      const calls=[];
      for(let i=0;i<count;i++){
        calls.push({name:'tick',args:[++remoteSequence,label+'/'+i,bytes]});
      }
      /** @type {{ok:boolean,value:unknown}[]} */
      const results=await publishedApi.batch(calls);
      assert.equal(results.length,count);
      assert.equal(results.every(item=>item.ok===true),true,'all private batch items must succeed');
      return results.map(item=>item.value);
    }

    for(let i=0;i<6;i++){
      const label='warm/'+i;
      assert.deepEqual(await remoteSession(1,8388608,label),await nativeSession(1,8388608,label));
    }
    const outcomes=[];
    const scenarios=[
      ...[0,1048576,8388608].flatMap(bytes=>
        [1,16,64].flatMap(count=>
          ['per-call','batch'].map(transport=>({bytes,count,transport,delayMs:0,trials:7})))),
      ...[1048576,8388608].flatMap(bytes=>
        [16,64].flatMap(count=>
          ['per-call','batch'].map(transport=>({bytes,count,transport,delayMs:25,trials:3}))))
    ];
    for(const {bytes,count,transport,delayMs,trials} of scenarios){
        serverDelayMs=delayMs;
        const chosenRemote=transport==='batch'?batchedSession:remoteSession;
        /** @type {number[]} */
        const ratios=[];
        /** @type {number[]} */
        const nativeTimes=[];
        /** @type {number[]} */
        const rpcTimes=[];
        for(let trial=0;trial<trials;trial++){
          const label='pair/'+bytes+'/'+count+'/'+transport+'/'+delayMs+'/'+trial;
          /** @type {{ns:number,value:unknown}} */
          let nativeMeasurement;
          /** @type {{ns:number,value:unknown}} */
          let remoteMeasurement;
          if(trial%2===0){
            nativeMeasurement=await measured(()=>nativeSession(count,bytes,label));
            remoteMeasurement=await measured(()=>chosenRemote(count,bytes,label));
          }else{
            remoteMeasurement=await measured(()=>chosenRemote(count,bytes,label));
            nativeMeasurement=await measured(()=>nativeSession(count,bytes,label));
          }
          assert.deepEqual(remoteMeasurement.value,nativeMeasurement.value);
          nativeTimes.push(nativeMeasurement.ns/1e6);
          rpcTimes.push(remoteMeasurement.ns/1e6);
          ratios.push(remoteMeasurement.ns/nativeMeasurement.ns);
        }
        outcomes.push({bytes,calls:count,transport,delayMs,comparisons:ratios.length,
          medianNativeMs:median(nativeTimes),medianRemoteMs:median(rpcTimes),
          medianPairedRatio:median(ratios),maxPairedRatio:Math.max(...ratios),
          strictOverBudget:ratios.filter(ratio=>ratio>2.5).length,ratios});
    }
    console.log(JSON.stringify({
      kind:'SCO-principal-realm-authenticated-HTTP-full-session',
      node:process.version,platform:process.platform,
      privateSourceSha256:[originalCode,dependentCode].map(code=>createHash('sha256').update(code).digest('hex')),
      publicSourceSha256:createHash('sha256').update(published).digest('hex'),
      explicitServerInitializationMs:initialization.ns/1e6,
      boundaries:'Server realm initialized before GET and sessions; actual generated SCO facade, HTTP JSON, and optional fixed server delay; no TLS or physical RTT.',
      outcomes
    }));
  }finally{
    global.fetch=nativeFetch;
    if(server.listening)await close(server);
    await pool.close();
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
