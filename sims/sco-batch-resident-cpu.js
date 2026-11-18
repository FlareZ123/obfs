'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {randomBytes,timingSafeEqual}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {performance}=require('node:perf_hooks');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {ROOT,EXPOSED,build}=require('../examples/application-challenge/sco-build.cjs');
const {externalValue}=require('../examples/application-challenge/sco-server.cjs');
const {pairedBudgetBound}=require('./paired-budget-bound');

/** @typedef {(seed:number,count:number)=>Promise<unknown>} Evaluate */
/** @typedef {(calls:Array<{name:string,args:number[]}>)=>Promise<Array<{ok:boolean,value:unknown}>>} Batch */
/** @typedef {{cpuMs:number,wallMs:number,values:unknown[]}} Observation */
/** @typedef {{iterationsPerCall:number,batchSize:number,totalCalls:number,rawCpuMs:{native:number[],batched:number[]},rawWallMs:{native:number[],batched:number[]},cpuBound:ReturnType<typeof pairedBudgetBound>|null,wallBound:ReturnType<typeof pairedBudgetBound>,strictCpuOverBudgetPairs:number,unresolvedCpuPairs:number,strictWallOverBudgetPairs:number}} Row */

/**
 * @param {() => Promise<unknown[]>} work
 * @returns {Promise<Observation>}
 */
async function observe(work){
  const cpuStart=process.cpuUsage();
  const wallStart=performance.now();
  const values=await work();
  const wallMs=performance.now()-wallStart;
  const used=process.cpuUsage(cpuStart);
  const cpuMs=(used.user+used.system)/1000;
  assert.ok(Number.isFinite(cpuMs)&&cpuMs>=0);
  assert.ok(Number.isFinite(wallMs)&&wallMs>0);
  return {values,cpuMs,wallMs};
}

/**
 * Compare the compiler's genuine opt-in `batch:true` SCO facade against
 * direct original private ESM calls. The trusted server revalidates every
 * nested operation's token, method identity and arguments before executing
 * the 1,024-call bounded batch sequentially. No private implementation
 * enters the HTTP-served stub.
 *
 * Each trial executes 12,288 original calls and exactly the same 12,288
 * operations in twelve authenticated batches. The output is compared at the
 * published JSON-value boundary; raw JS object identity and own undefined
 * fields are intentionally outside this interface.
 *
 * @param {number} [rounds]
 * @param {boolean} [stability] Perform 51 longer 24,576-call paired trials of the selected 1,000-iteration operation only.
 * @returns {Promise<{source:string,platform:NodeJS.Platform,node:string,batchSize:number,perObservationCalls:number,initializationExcluded:boolean,stability:boolean,cpuScope:string,rows:Row[]}>}
 */
async function run(rounds=13,stability=false){
  if(!Number.isSafeInteger(rounds)||rounds<9||rounds>100)
    throw new RangeError('Expected 9 to 100 paired batches');
  if(typeof stability!=='boolean')throw new TypeError('Expected boolean stability selection');
  const oldWindow=globalThis.window;
  const originalFetch=globalThis.fetch;
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-batch-cpu-'));
  /** @type {http.Server|undefined} */
  let server;
  try{
    globalThis.window=/** @type {Window & typeof globalThis} */ (
      /** @type {unknown} */ ({externalValue}));
    // Verify the same six-file closed private graph before constructing the
    // batch-enabled public stub. Publication rejects originals by SHA-256.
    const graph=await build();
    const originalSource=await fs.readFile(path.join(ROOT,EXPOSED),'utf8');
    const partition=partitionScoAsyncModule({
      path:EXPOSED,sourceType:'module',code:originalSource
    },{
      seed:'sco-batch-cpu-partition-20261118',
      serverOnlyInitialization:true,batch:true,maxBatchCalls:1024
    });
    assert.ok(partition.batchMethod,'Generated public module needs a real batch export');
    assert.deepEqual(partition.names,['evaluateRemote']);
    const privateModule=/** @type {{evaluateRemote:Evaluate}} */(
      await import(pathToFileURL(path.join(ROOT,EXPOSED)).href));
    const native=privateModule.evaluateRemote;
    const registry=bindScoModuleExports(partition,privateModule);
    const method=partition.methodNames.evaluateRemote;
    const batchMethod=partition.batchMethod;
    const bearer=randomBytes(24).toString('hex');
    const expected=Buffer.from(bearer);
    /** @param {http.IncomingMessage} request @returns {boolean} */
    const authorized=request=>{
      const received=Buffer.from(String(request.headers['x-batch-token']??''));
      return received.length===expected.length&&timingSafeEqual(received,expected);
    };
    partition.clientFile.privateModulePaths=[...graph.privatePaths];
    partition.clientFile.privateOriginalDigests=graph.privateSourceDigests.map(
      entry=>entry.sha256);
    const handler=createScoHandler([partition.clientFile],{
      publicPaths:[EXPOSED],
      remoteMethods:registry,
      maxRpcBytes:262144,
      authorizeRead:authorized,
      authorizeRpc:authorized,
      authorizeOperation:(request,name,args)=>{
        if(!authorized(request))return false;
        if(name===batchMethod)return args.length===1&&Array.isArray(args[0]);
        return name===method&&args.length===2&&
          typeof args[0]==='number'&&Number.isInteger(args[0])&&
          args[0]>=0&&args[0]<=0xffffffff&&
          typeof args[1]==='number'&&Number.isInteger(args[1])&&
          args[1]>=0&&args[1]<=150000;
      }
    });
    server=http.createServer(handler);
    await new Promise(resolve=>server?.listen(0,'127.0.0.1',()=>resolve(undefined)));
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Expected localhost listener');
    const origin='http://127.0.0.1:'+address.port;
    // Actual HTTP denials prevent a performance-only success from being
    // mistaken for a protected authenticated transport.
    const deniedPublic=await originalFetch(origin+'/obfs/'+EXPOSED);
    assert.equal(deniedPublic.status,403,'SCO public facade must require authorization');
    const deniedRpc=await originalFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:batchMethod,args:[[{method,args:[0,1]}]]})
    });
    assert.equal(deniedRpc.status,403,'Unauthenticated SCO batch must be denied');
    const deniedInner=await originalFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json',
        'x-batch-token':bearer},
      body:JSON.stringify({method:batchMethod,args:[[{method,args:[0,150001]}]]})
    });
    assert.equal(deniedInner.status,403,
      'Authenticated outer batch must not bypass an invalid inner argument');
    globalThis.fetch=(input,init)=>{
      const headers=new Headers(init?.headers);
      headers.set('x-batch-token',bearer);
      return originalFetch(new URL(String(input),origin),{...init,headers});
    };
    const served=await globalThis.fetch('/obfs/'+EXPOSED);
    assert.equal(served.status,200,'Batch facade must genuinely be served over HTTP');
    const publishedSource=await served.text();
    assert.ok(!publishedSource.includes('createEngine'),
      'No private engine source may appear in the served facade');
    const sourcePath=path.join(temp,'facade.mjs');
    await atomicWrite(sourcePath,publishedSource);
    const published=/** @type {{batch:Batch}} */ (
      await import(pathToFileURL(sourcePath).href));
    assert.equal(typeof published.batch,'function');

    const batchSize=1024,totalCalls=(stability?24:12)*batchSize;
    /** @type {Row[]} */
    const rows=[];
    for(const iterationsPerCall of (stability?[1000]:[1,1000])){
      const seeds=[0x12345678,0xffffffff,0x9e3779b9];
      const cases=Array.from({length:totalCalls},(_,index)=>
        /** @type {readonly [number,number]} */ (
          [seeds[index%seeds.length],iterationsPerCall]));
      /** @returns {Promise<unknown[]>} */
      async function nativeWork(){
        const values=[];
        for(const [seed,count] of cases)values.push(await native(seed,count));
        return values;
      }
      /** @returns {Promise<unknown[]>} */
      async function batchedWork(){
        /** @type {unknown[]} */
        const values=[];
        for(let begin=0;begin<cases.length;begin+=batchSize){
          const calls=cases.slice(begin,begin+batchSize).map(([seed,count])=>({
            name:'evaluateRemote',args:[seed,count]
          }));
          const returned=await published.batch(calls);
          assert.equal(returned.length,calls.length);
          for(const item of returned){
            assert.equal(item.ok,true,'Every inner authenticated method must succeed');
            values.push(item.value);
          }
        }
        return values;
      }
      for(let warm=0;warm<3;warm++){
        const control=await observe(nativeWork);
        const remote=await observe(batchedWork);
        assert.equal(JSON.stringify(remote.values),JSON.stringify(control.values),
          'Warmup batched results differ across the declared wire value contract');
      }
      /** @type {number[]} */
      const nativeCpuMs=[];
      /** @type {number[]} */
      const batchedCpuMs=[];
      /** @type {number[]} */
      const nativeWallMs=[];
      /** @type {number[]} */
      const batchedWallMs=[];
      for(let trial=0;trial<rounds;trial++){
        let original,remote;
        if(trial%2===0){
          original=await observe(nativeWork);
          remote=await observe(batchedWork);
        }else{
          remote=await observe(batchedWork);
          original=await observe(nativeWork);
        }
        assert.equal(JSON.stringify(remote.values),JSON.stringify(original.values),
          'Authenticated batches changed ordered JSON-wire results');
        nativeCpuMs.push(original.cpuMs);batchedCpuMs.push(remote.cpuMs);
        nativeWallMs.push(original.wallMs);batchedWallMs.push(remote.wallMs);
      }
      const unresolved=nativeCpuMs.filter((ms,index)=>
        ms===0||batchedCpuMs[index]===0).length;
      rows.push({
        iterationsPerCall,batchSize,totalCalls,
        rawCpuMs:{native:nativeCpuMs,batched:batchedCpuMs},
        rawWallMs:{native:nativeWallMs,batched:batchedWallMs},
        cpuBound:unresolved===0?pairedBudgetBound(nativeCpuMs,batchedCpuMs):null,
        wallBound:pairedBudgetBound(nativeWallMs,batchedWallMs),
        strictCpuOverBudgetPairs:nativeCpuMs.filter((value,index)=>
          value>0&&batchedCpuMs[index]>2.5*value).length,
        unresolvedCpuPairs:unresolved,
        strictWallOverBudgetPairs:nativeWallMs.filter((value,index)=>
          batchedWallMs[index]>2.5*value).length
      });
    }
    return {
      source:'sims/sco-batch-resident-cpu.js',platform:process.platform,
      node:process.version,batchSize,perObservationCalls:totalCalls,
      initializationExcluded:true,stability,
      cpuScope:'Whole-process CPU from direct native methods versus twelve actually authenticated, internally authorized JSON batches, each containing 1,024 original operations. Startup and import excluded. Raw JS object shape is outside JSON API.',
      rows
    };
  }finally{
    globalThis.fetch=originalFetch;
    if(server){
      const active=server;
      await new Promise((resolve,reject)=>active.close(
        error=>error?reject(error):resolve(undefined)));
    }
    if(oldWindow===undefined)Reflect.deleteProperty(globalThis,'window');
    else globalThis.window=oldWindow;
    await fs.rm(temp,{recursive:true,force:true});
  }
}

if(require.main===module){
  const stability=process.argv.includes('--stability');
  run(stability?51:13,stability).then(async report=>{
    const serialized=JSON.stringify(report);
    if(process.env.OBFS_SCO_BATCH_AUDIT_FILE){
      await atomicWrite(process.env.OBFS_SCO_BATCH_AUDIT_FILE,
        JSON.stringify(report,null,2)+'\n');
    }
    process.stdout.write('SCO_BATCH_RESIDENT_CPU '+serialized+'\n');
  }).catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
  });
}

module.exports={run,observe};
