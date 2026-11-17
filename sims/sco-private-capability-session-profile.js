'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes,createHash,createHmac}=require('node:crypto');
const {createScoHandler,createScoCapabilityScope,createScoPrivateHandles,createScoRpcClientSource}=require('../src');

const WORK=Buffer.alloc(8*1024*1024,0x37);

/** @typedef {{counter:number}} PrivateCounter */
/** @typedef {{bytes:number,calls:number,ratios:number[],nativeMs:number[],remoteMs:number[]}} SampleGroup */

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  const center=sorted.length>>1;
  return sorted.length%2 ? sorted[center] : (sorted[center-1]+sorted[center])/2;
}

/** @param {()=>Promise<void>} operation @returns {Promise<number>} */
async function elapsed(operation) {
  const started=process.hrtime.bigint();
  await operation();
  return Number(process.hrtime.bigint()-started)/1e6;
}

/**
 * Measure a real local authenticated HTTP facade against the same HMAC and
 * capability-store operation running directly in the native Node realm.
 * The client performs sequential calls with a warmed ESM import. Server setup
 * and the first remote handle issuance are reported separately; they are not
 * silently counted as permitted client-side initialization.
 *
 * @returns {Promise<object>}
 */
async function experiment() {
  const root=randomBytes(32);
  const session=randomBytes(32).toString('hex');
  const source=createScoRpcClientSource(['issue','step']);
  const sourceHash=createHash('sha256').update(source).digest('hex');
  const scope=createScoCapabilityScope(request=>
    request.headers.cookie==='session='+session?'account-A':'unverified', {
      maxPendingPerPrincipal:80,maxPendingTotal:80
    });
  const handles=createScoPrivateHandles(scope.currentPrincipal,{
    maxHandles:8,maxHandlesPerPrincipal:8,ttlMs:600000
  });
  /** @type {http.IncomingMessage} */
  const nativeRequest=/** @type {http.IncomingMessage} */ (
    /** @type {unknown} */ ({headers:{cookie:'session='+session}}));
  /**
   * @param {string} handle
   * @param {string} input
   * @param {number} bytes
   * @returns {string}
   */
  function step(handle,input,bytes) {
    return handles.use(handle,value=>{
      const counter=/** @type {PrivateCounter} */ (value);
      counter.counter++;
      return createHmac('sha256',root)
        .update(String(counter.counter)).update(':').update(input)
        .update(WORK.subarray(0,bytes)).digest('hex');
    });
  }
  const handler=createScoHandler([{
    path:'public.mjs',sourceType:'module',code:source
  }],{
    publicPaths:['public.mjs'],
    remoteMethods:{
      issue:()=>handles.issue({counter:0}),
      step
    },
    authorizeRead:request=>request.headers.cookie==='session='+session,
    authorizeRpc:request=>request.headers.cookie==='session='+session,
    authorizeOperation:(request,method,args)=>
      request.headers.cookie==='session='+session && (
        method==='issue'&&args.length===0 ||
        method==='step'&&args.length===3&&
          typeof args[0]==='string'&&typeof args[1]==='string'&&
          (args[2]===0||args[2]===WORK.length)
      ),
    runRpcIsolated:scope.runRpcIsolated
  });
  const server=http.createServer(handler);
  /** @type {Promise<void>} */
  const listening=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await listening;
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  const origin='http://127.0.0.1:'+address.port;
  const nativeFetch=globalThis.fetch;
  try {
    const unauth=await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({method:'issue',args:[]})
    });
    assert.equal(unauth.status,403);
    const published=await nativeFetch(origin+'/obfs/public.mjs',{
      headers:{cookie:'session='+session}
    });
    assert.equal(published.status,200);
    const served=await published.text();
    assert.equal(served,source);
    assert.doesNotMatch(served,/createHmac|WORK\.subarray|PrivateCounter/u);
    globalThis.fetch=/** @type {typeof fetch} */ ((input,options)=>
      nativeFetch(new URL(input instanceof Request?input.url:String(input),origin),{
        ...options,headers:{...options?.headers,cookie:'session='+session}
      }));
    const startedImport=process.hrtime.bigint();
    const facade=/** @type {{issue:()=>Promise<string>,
      step:(handle:string,input:string,bytes:number)=>Promise<string>}} */
      (await import('data:text/javascript,'+encodeURIComponent(source)));
    const clientImportMs=Number(process.hrtime.bigint()-startedImport)/1e6;
    let nativeHandle='';
    await scope.runRpcIsolated(nativeRequest,async()=>{
      nativeHandle=handles.issue({counter:0});
    });
    let remoteHandle='';
    const coldIssueMs=await elapsed(async()=>{
      remoteHandle=await facade.issue();
      assert.match(remoteHandle,/^[A-Za-z0-9_-]{43}$/u);
    });
    // Separate native and remote state counters stay aligned after both
    // were created with independent private-capability handle values.
    /** @type {SampleGroup[]} */
    const groups=[];
    for(const bytes of [0,WORK.length])for(const calls of [1,16,64]) {
      /** @type {SampleGroup} */
      const group={bytes,calls,ratios:[],nativeMs:[],remoteMs:[]};
      for(let trial=0;trial<7;trial++) {
        const inputs=Array.from({length:calls},(_,index)=>
          'same-input/'+bytes+'/'+calls+'/'+trial+'/'+index);
        /** @type {string[]} */
        let nativeOutput=[];
        /** @type {string[]} */
        let remoteOutput=[];
        const nativeOperation=async()=>{
          await scope.runRpcIsolated(nativeRequest,async()=>{
            nativeOutput=inputs.map(input=>step(nativeHandle,input,bytes));
          });
        };
        const remoteOperation=async()=>{
          remoteOutput=[];
          for(const input of inputs) {
            remoteOutput.push(await facade.step(remoteHandle,input,bytes));
          }
        };
        let nativeMs,remoteMs;
        if(trial%2===0) {
          nativeMs=await elapsed(nativeOperation);
          remoteMs=await elapsed(remoteOperation);
        }else{
          remoteMs=await elapsed(remoteOperation);
          nativeMs=await elapsed(nativeOperation);
        }
        assert.deepEqual(remoteOutput,nativeOutput);
        assert.ok(nativeMs>0 && remoteMs>0);
        group.nativeMs.push(nativeMs);
        group.remoteMs.push(remoteMs);
        group.ratios.push(remoteMs/nativeMs);
      }
      groups.push(group);
    }
    return {
      kind:'SCO-private-capability-generated-RPC-whole-session',
      platform:process.platform,node:process.version,
      sourceSha256:sourceHash,
      publishedBytes:Buffer.byteLength(source),
      serverInitialSetupExcluded:true,clientEsmImportMs:clientImportMs,
      firstPublicIssueMs:coldIssueMs,
      transport:'Actual authenticated sequential local HTTP POST per protected step; no TLS or physical RTT',
      body:'Native API keeps the same server-resident capability-store/crypto work, invoked in one active original realm per session',
      workloads:groups.map(group=>({
        bytesPerStep:group.bytes,calls:group.calls,trials:group.ratios.length,
        medianNativeMs:median(group.nativeMs),medianRemoteMs:median(group.remoteMs),
        medianPairedRatio:median(group.ratios),maximumPairedRatio:Math.max(...group.ratios),
        strictAbove2_5:group.ratios.filter(ratio=>ratio>2.5).length,
        pairedRatios:group.ratios.map(ratio=>Number(ratio.toFixed(6)))
      })),
      scope:'Workload-specific sampled full-session overhead; strict above-2.5 pairs veto sampled scope; no universal claim'
    };
  }finally {
    globalThis.fetch=nativeFetch;
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await closed;
  }
}

if(require.main===module) {
  experiment().then(result=>process.stdout.write(
    'SCO_CAPABILITY_REAL_HTTP_BUDGET '+JSON.stringify(result)+'\n'),
  error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
}

module.exports={experiment};
