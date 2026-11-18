'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createHash,randomBytes,timingSafeEqual}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {performance}=require('node:perf_hooks');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');
const {ROOT,EXPOSED,build}=require('../examples/application-challenge/sco-build.cjs');
const {externalValue}=require('../examples/application-challenge/sco-server.cjs');
const {pairedBudgetBound}=require('./paired-budget-bound');
const {atomicWrite}=require('../src/atomic');

const executeFile=promisify(execFile);
const CHILD=path.join(__dirname,'sco-batch-process-client.cjs');
/** @typedef {'native'|'remote'} Kind */
/** @typedef {{mode:Kind,calls:number,cpuMs:number,outputSha256:string,publicSourceSha256:string|null}} ChildResult */
/** @typedef {{cpuMs:number,wallMs:number,parentCpuMs:number,clientCpuMs:number,outputSha256:string}} Sample */
/** @typedef {{iterationsPerCall:number,totalCalls:number,nativeCpuMs:number[],remoteCpuMs:number[],nativeWallMs:number[],remoteWallMs:number[],nativeParentCpuMs:number[],remoteParentCpuMs:number[],nativeClientCpuMs:number[],remoteClientCpuMs:number[],strictCpuBreaches:number,strictWallBreaches:number,cpuBound:ReturnType<typeof pairedBudgetBound>,wallBound:ReturnType<typeof pairedBudgetBound>}} Row */

/**
 * Fresh Node child from process creation through output digest. Parent CPU
 * includes its already initialized trusted HTTP handler when the remote child
 * invokes it. Adding the two process CPU observations measures combined
 * client+server work, rather than the waiting parent's wall clock alone.
 *
 * @param {Kind} mode
 * @param {number} iterationsPerCall
 * @param {number} totalCalls
 * @param {string} origin
 * @param {string} bearer
 * @param {string} publicSha256
 * @returns {Promise<Sample>}
 */
async function observeChild(mode,iterationsPerCall,totalCalls,origin,bearer,publicSha256){
  const parentStart=process.cpuUsage();
  const wallStart=performance.now();
  const {stdout}=await executeFile(process.execPath,[
    CHILD,mode,origin,bearer,String(iterationsPerCall),String(totalCalls),
    path.join(ROOT,EXPOSED),EXPOSED
  ],{encoding:'utf8',timeout:60000,maxBuffer:1024*1024});
  const wallMs=performance.now()-wallStart;
  const parent=process.cpuUsage(parentStart);
  const parentCpuMs=(parent.user+parent.system)/1000;
  const child=/** @type {ChildResult} */ (JSON.parse(stdout));
  assert.equal(child.mode,mode);
  assert.equal(child.calls,totalCalls);
  assert.match(child.outputSha256,/^[0-9a-f]{64}$/u);
  assert.ok(Number.isFinite(child.cpuMs)&&child.cpuMs>0);
  if(mode==='remote')assert.equal(child.publicSourceSha256,publicSha256,
    'Actual remote client received unexpected source bytes');
  else assert.equal(child.publicSourceSha256,null);
  assert.ok(parentCpuMs>=0&&wallMs>0);
  return {
    cpuMs:parentCpuMs+child.cpuMs,wallMs,parentCpuMs,
    clientCpuMs:child.cpuMs,outputSha256:child.outputSha256
  };
}

/**
 * An actual batch-enabled compiler and trusted-source experiment, measured
 * from fresh Node client process launch on both sides. The native client
 * loads and computes the original ESM module in its own process. The remote
 * client downloads and compiles the real authenticated generated facade and
 * invokes the trusted original through bounded batches. The trusted server
 * stays initialized; total CPU counts both processes for each observation.
 *
 * @param {number} [rounds]
 * @returns {Promise<{source:string,platform:NodeJS.Platform,node:string,sourceSha256:string,totalCalls:number,serverInitializationExcluded:boolean,freshClientProcessIncluded:boolean,cpuScope:string,rows:Row[]}>}
 */
async function run(rounds=9){
  if(!Number.isSafeInteger(rounds)||rounds<9||rounds>30)
    throw new RangeError('Expected 9 through 30 paired fresh-process trials');
  const previousWindow=globalThis.window;
  /** @type {http.Server|undefined} */
  let server;
  try{
    globalThis.window=/** @type {Window & typeof globalThis} */(
      /** @type {unknown} */ ({externalValue}));
    const graph=await build();
    const privateSource=await fs.readFile(path.join(ROOT,EXPOSED),'utf8');
    const partition=partitionScoAsyncModule({
      path:EXPOSED,code:privateSource,sourceType:'module'
    },{
      seed:'sco-batch-fresh-client-20261118',
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
    const bearer=randomBytes(24).toString('hex');
    const expectedToken=Buffer.from(bearer,'utf8');
    /** @param {http.IncomingMessage} request @returns {boolean} */
    function authorized(request){
      const actual=Buffer.from(String(request.headers['x-batch-token']??''),'utf8');
      return actual.length===expectedToken.length&&
        timingSafeEqual(actual,expectedToken);
    }
    const directMethod=partition.methodNames.evaluateRemote;
    const batchMethod=partition.batchMethod;
    const handler=createScoHandler([partition.clientFile],{
      publicPaths:[EXPOSED],remoteMethods:registry,maxRpcBytes:262144,
      authorizeRead:authorized,authorizeRpc:authorized,
      authorizeOperation:(request,method,args)=>{
        if(!authorized(request))return false;
        if(method===batchMethod){
          if(args.length!==1||!Array.isArray(args[0])||
              args[0].length===0||args[0].length>1024)return false;
          let totalWork=0;
          for(const call of args[0]){
            if(!call||typeof call!=='object'||call.name!=='evaluateRemote'||
                !Array.isArray(call.args)||call.args.length!==2||
                typeof call.args[1]!=='number'||
                !Number.isSafeInteger(call.args[1])||call.args[1]<0||
                call.args[1]>150000)return false;
            totalWork+=call.args[1];
            if(totalWork>1024*1000)return false;
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
    server=http.createServer(handler);
    await new Promise(resolve=>server?.listen(0,'127.0.0.1',()=>resolve(undefined)));
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing loopback listener');
    const origin='http://127.0.0.1:'+address.port;
    assert.equal((await fetch(origin+'/obfs/'+EXPOSED)).status,403,
      'Unauthenticated source must not be accessible');
    const publicResponse=await fetch(origin+'/obfs/'+EXPOSED,{
      headers:{'x-batch-token':bearer}
    });
    assert.equal(publicResponse.status,200);
    const publicSource=await publicResponse.text();
    assert.ok(!publicSource.includes('createEngine'),
      'Actual public ESM must withhold private engine source');
    const sourceSha256=createHash('sha256').update(publicSource).digest('hex');
    /** @type {Row[]} */
    const rows=[];
    const totalCalls=12*1024;
    for(const iterationsPerCall of [1,1000]){
      /** @type {Sample[]} */
      const originalSamples=[];
      /** @type {Sample[]} */
      const remoteSamples=[];
      for(let pair=0;pair<rounds;pair++){
        let originalSample,remoteSample;
        if(pair%2===0){
          originalSample=await observeChild('native',iterationsPerCall,totalCalls,
            origin,bearer,sourceSha256);
          remoteSample=await observeChild('remote',iterationsPerCall,totalCalls,
            origin,bearer,sourceSha256);
        }else{
          remoteSample=await observeChild('remote',iterationsPerCall,totalCalls,
            origin,bearer,sourceSha256);
          originalSample=await observeChild('native',iterationsPerCall,totalCalls,
            origin,bearer,sourceSha256);
        }
        assert.equal(remoteSample.outputSha256,originalSample.outputSha256,
          'Fresh original and real HTTP batched client changed ordered JSON values');
        originalSamples.push(originalSample);
        remoteSamples.push(remoteSample);
      }
      const nativeCpuMs=originalSamples.map(x=>x.cpuMs);
      const remoteCpuMs=remoteSamples.map(x=>x.cpuMs);
      const nativeWallMs=originalSamples.map(x=>x.wallMs);
      const remoteWallMs=remoteSamples.map(x=>x.wallMs);
      rows.push({
        iterationsPerCall,totalCalls,nativeCpuMs,remoteCpuMs,
        nativeWallMs,remoteWallMs,
        nativeParentCpuMs:originalSamples.map(x=>x.parentCpuMs),
        remoteParentCpuMs:remoteSamples.map(x=>x.parentCpuMs),
        nativeClientCpuMs:originalSamples.map(x=>x.clientCpuMs),
        remoteClientCpuMs:remoteSamples.map(x=>x.clientCpuMs),
        cpuBound:pairedBudgetBound(nativeCpuMs,remoteCpuMs),
        wallBound:pairedBudgetBound(nativeWallMs,remoteWallMs),
        strictCpuBreaches:nativeCpuMs.filter((ms,i)=>remoteCpuMs[i]>2.5*ms).length,
        strictWallBreaches:nativeWallMs.filter((ms,i)=>remoteWallMs[i]>2.5*ms).length
      });
    }
    return {
      source:'sims/sco-batch-fresh-process-cpu.js',platform:process.platform,
      node:process.version,sourceSha256,totalCalls,
      serverInitializationExcluded:true,freshClientProcessIncluded:true,
      cpuScope:'Parent trusted-server CPU plus whole fresh child-process CPU from launch. Original ESM and generated HTTP ESM compile in their corresponding child; original trusted server private graph was pre-initialized. Loopback network; no browser, cross-network RTT, TLS, equal-trust minified control or raw non-JSON value equivalence.',
      rows
    };
  }finally{
    if(server){
      const active=server;
      await new Promise((resolve,reject)=>active.close(
        error=>error?reject(error):resolve(undefined)));
    }
    if(previousWindow===undefined)Reflect.deleteProperty(globalThis,'window');
    else globalThis.window=previousWindow;
  }
}

if(require.main===module)run().then(async report=>{
  if(process.env.OBFS_SCO_BATCH_PROCESS_AUDIT_FILE)
    await atomicWrite(process.env.OBFS_SCO_BATCH_PROCESS_AUDIT_FILE,
      JSON.stringify(report,null,2)+'\n');
  process.stdout.write('SCO_BATCH_FRESH_PROCESS '+JSON.stringify(report)+'\n');
}).catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={run,observeChild};
