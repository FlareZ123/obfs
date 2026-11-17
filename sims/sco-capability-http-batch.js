'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {performance}=require('node:perf_hooks');
const {cpuUsage}=require('node:process');
const {createHash,createHmac,randomBytes}=require('node:crypto');
const {atomicWrite}=require('../src/atomic');
const {
  partitionScoAsyncModule,bindScoModuleExports,createScoHandler,
  createScoCapabilityScope,createScoPrivateHandles
}=require('../src');

const BLOCK_BYTES=8*1024*1024;
const CALLS=16;
const INPUT_PATTERN=/^[0-9a-f]{32}$/u;
/** @typedef {'native'|'serial-rpc'|'batch-rpc'|'guarded-rpc'} Path */
/** @typedef {{mode:Path,elapsedMs:number,cpuMs:number,outputs:string[]}} Sample */

/** @param {number} index @returns {string} */
function challenge(index){
  return createHash('sha256').update('capability-batch-'+index)
    .digest('hex').slice(0,32);
}

/**
 * Compare original stateful HMAC business work against the *actual generated*
 * SCO public ESM facade in a single Node process. Session cost includes
 * bearer issue and revoke RPCs, with 16 actual business operations. The same
 * trusted server and private value are used for serial and batch paths.
 *
 * @param {number} [trials]
 * @returns {Promise<{runtime:string,platform:string,publicSha256:string,
 *   blockBytes:number,businessCalls:number,records:Record<string,unknown>[],
 *   summaries:Record<string,unknown>[]}>}
 */
async function run(trials=8){
  if(!Number.isSafeInteger(trials)||trials<1||trials>8)throw RangeError('trials 1..8');
  const key=randomBytes(32);
  const secretKeyHex=key.toString('hex');
  const sessionSecret=randomBytes(24).toString('hex');
  const payload=Buffer.alloc(BLOCK_BYTES,0x63);
  const inputs=Array.from({length:CALLS},(_,index)=>challenge(index));
  const privateCanary='sco-private-capability-coarse-key';
  const source=[
    "import {createHmac} from 'node:crypto';",
    "const secret=Buffer.from("+JSON.stringify(secretKeyHex)+",'hex');",
    "const payload=Buffer.alloc("+BLOCK_BYTES+",0x63);",
    "const canary="+JSON.stringify(privateCanary)+";",
    'const handles=globalThis.__SCO_BATCH_PRIVATE_HANDLES__;',
    'function digest(state,input){',
    " return createHmac('sha256',secret).update(payload)",
    " .update(String(state.index++)).update(input).digest('hex');",
    '}',
    'export async function begin(){return handles.issue({index:0});}',
    'export async function step(token,input){',
    ' return handles.use(token,state=>digest(state,input));',
    '}',
    'export async function batch(token,values){',
    ' return handles.use(token,state=>values.map(input=>digest(state,input)));',
    '}',
    'export async function batchGuarded(token,values){',
    ' return handles.use(token,state=>{',
    '  const outputs=[];',
    '  for(let index=0;index<values.length;index++){',
    '   const value=values[index];',
    '   if(typeof value!=="string"||!/^[0-9a-f]{32}$/.test(value)){',
    '    return {ok:false,failedAt:index,outputs};',
    '   }',
    '   outputs.push(digest(state,value));',
    '  }',
    '  return {ok:true,failedAt:null,outputs};',
    ' });',
    '}',
    'export async function close(token){return handles.revoke(token);}'
  ].join('\n');
  const globals=/** @type {Record<string,unknown>} */ (/** @type {unknown} */(globalThis));
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sco-capability-batch-'));
  const nativeFetch=globalThis.fetch;
  let delayMs=0;
  /** @type {http.Server|undefined} */let server;
  try{
    const scope=createScoCapabilityScope(request=>
      request.headers['x-batch-session']===sessionSecret?'verified-A':'unverified',
    {maxPendingTotal:64,maxPendingPerPrincipal:32});
    const handles=createScoPrivateHandles(scope.currentPrincipal);
    const privatePath=path.join(root,'server.mjs');
    await atomicWrite(privatePath,source);
    globals.__SCO_BATCH_PRIVATE_HANDLES__=handles;
    const originalModule=await import(pathToFileURL(privatePath).href);
    delete globals.__SCO_BATCH_PRIVATE_HANDLES__;
    const partition=partitionScoAsyncModule({
      path:'public.mjs',sourceType:'module',code:source
    },{seed:'capability-coarse-real-session',serverOnlyInitialization:true});
    const methods=partition.methodNames;
    server=http.createServer(createScoHandler([partition.clientFile],{
      remoteMethods:bindScoModuleExports(partition,originalModule),
      publicPaths:['public.mjs'],authorizeRead:()=>true,
      authorizeRpc:async request=>{
        if(delayMs>0)await new Promise(resolve=>setTimeout(resolve,delayMs));
        return request.headers['x-batch-session']===sessionSecret;
      },
      authorizeOperation:(request,method,args)=>{
        if(request.headers['x-batch-session']!==sessionSecret)return false;
        if(method===methods.begin)return args.length===0;
        if(method===methods.close)return args.length===1&&typeof args[0]==='string';
        if(method===methods.step)return args.length===2 &&
          typeof args[0]==='string'&&typeof args[1]==='string'&&INPUT_PATTERN.test(args[1]);
        // Guarded batches validate bounded input shape at admission, then
        // enforce the original per-item policy inside the trusted callback.
        if(method===methods.batchGuarded)return args.length===2&&
          typeof args[0]==='string'&&Array.isArray(args[1])&&
          args[1].length>=1&&args[1].length<=CALLS&&
          args[1].every(value=>typeof value==='string');
        if(method===methods.batch)return args.length===2&&typeof args[0]==='string'&&
          Array.isArray(args[1])&&args[1].length===CALLS&&
          args[1].every(value=>typeof value==='string'&&INPUT_PATTERN.test(value));
        return false;
      },
      runRpcIsolated:scope.runRpcIsolated
    }));
    const running=server;
    await new Promise(resolve=>running.listen(0,'127.0.0.1',()=>resolve(undefined)));
    const address=running.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    const denied=await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:methods.begin,args:[]})
    });
    assert.equal(denied.status,403);
    const response=await nativeFetch(origin+'/obfs/public.mjs');
    assert.equal(response.status,200);
    const publicCode=await response.text();
    assert.equal(publicCode.includes(secretKeyHex),false);
    assert.equal(publicCode.includes(privateCanary),false);
    assert.equal(publicCode.includes('createHmac'),false);
    const publicSha256=createHash('sha256').update(publicCode).digest('hex');
    const publicPath=path.join(root,'public.mjs');
    await atomicWrite(publicPath,publicCode);
    globalThis.fetch=/** @type {typeof fetch} */(async(input,options)=>{
      const headers=new Headers(options?.headers);
      headers.set('x-batch-session',sessionSecret);
      return nativeFetch(new URL(String(input),origin),{...options,headers});
    });
    /** @type {{
     *   begin:()=>Promise<string>,
     *   step:(token:string,input:string)=>Promise<string>,
     *   batch:(token:string,inputs:string[])=>Promise<string[]>,
     *   batchGuarded:(token:string,inputs:string[])=>Promise<{ok:boolean,failedAt:number|null,outputs:string[]}>,
     *   close:(token:string)=>Promise<boolean>
     * }} */
    const facade=await import(pathToFileURL(publicPath).href);

    /** @returns {string[]} */
    function native(){
      let index=0;
      return inputs.map(input=>createHmac('sha256',key).update(payload)
        .update(String(index++)).update(input).digest('hex'));
    }

    /** @param {Path} mode @returns {Promise<Sample>} */
    async function sample(mode){
      const startCpu=cpuUsage();
      const startWall=performance.now();
      /** @type {string[]} */let outputs=[];
      if(mode==='native')outputs=native();
      else{
        const token=await facade.begin();
        if(mode==='batch-rpc')outputs=await facade.batch(token,inputs);
        else if(mode==='guarded-rpc'){
          const guarded=await facade.batchGuarded(token,inputs);
          assert.deepEqual({ok:guarded.ok,failedAt:guarded.failedAt},
            {ok:true,failedAt:null});
          outputs=guarded.outputs;
        }else for(const input of inputs)outputs.push(await facade.step(token,input));
        assert.equal(await facade.close(token),true);
      }
      const elapsedMs=performance.now()-startWall;
      const delta=cpuUsage(startCpu);
      const cpuMs=(delta.user+delta.system)/1000;
      assert.ok(elapsedMs>0);
      assert.equal(outputs.length,CALLS);
      return {mode,elapsedMs,cpuMs,outputs};
    }

    // One untimed full session per variant eliminates initial import/setup
    // but cannot eliminate normal process JIT or runner scheduling variation.
    for(const mode of /** @type {Path[]} */(['native','serial-rpc','batch-rpc','guarded-rpc'])){
      assert.deepEqual((await sample(mode)).outputs,native());
    }
    /** @type {Record<string,unknown>[]} */const records=[];
    /** @type {Record<string,unknown>[]} */const summaries=[];
    // The private guarded batch commits only authorized valid prefixes.
    const partialHandle=await facade.begin();
    const partial=await facade.batchGuarded(partialHandle,
      [inputs[0],inputs[1],'bad-input',inputs[2]]);
    assert.deepEqual(partial,{
      ok:false,failedAt:2,outputs:native().slice(0,2)
    });
    const continued=await facade.step(partialHandle,inputs[2]);
    assert.equal(continued,native()[2]);
    assert.equal(await facade.close(partialHandle),true);
    const paths=/** @type {Path[]} */(['native','serial-rpc','batch-rpc','guarded-rpc']);
    for(const latency of [0,25]){
      delayMs=latency;
      let serialOverWall=0,batchOverWall=0,guardedOverWall=0;
      let serialOverCpu=0,batchOverCpu=0,guardedOverCpu=0;
      let serialUnresolvedCpu=0,batchUnresolvedCpu=0,guardedUnresolvedCpu=0;
      let serialMaxWall=0,batchMaxWall=0,guardedMaxWall=0;
      let serialMaxCpu=0,batchMaxCpu=0,guardedMaxCpu=0;
      for(let trial=0;trial<trials;trial++){
        const order=[paths[trial%4],paths[(trial+1)%4],
          paths[(trial+2)%4],paths[(trial+3)%4]];
        /** @type {Partial<Record<Path,Sample>>} */const outcomes={};
        for(const mode of order)outcomes[mode]=await sample(mode);
        const baseline=/** @type {Sample} */(outcomes.native);
        const serial=/** @type {Sample} */(outcomes['serial-rpc']);
        const batch=/** @type {Sample} */(outcomes['batch-rpc']);
        const guarded=/** @type {Sample} */(outcomes['guarded-rpc']);
        assert.deepEqual(serial.outputs,baseline.outputs);
        assert.deepEqual(batch.outputs,baseline.outputs);
        assert.deepEqual(guarded.outputs,baseline.outputs);
        const serialWallRatio=serial.elapsedMs/baseline.elapsedMs;
        const batchWallRatio=batch.elapsedMs/baseline.elapsedMs;
        const guardedWallRatio=guarded.elapsedMs/baseline.elapsedMs;
        const serialCpuRatio=baseline.cpuMs>0&&serial.cpuMs>0?
          serial.cpuMs/baseline.cpuMs:null;
        const batchCpuRatio=baseline.cpuMs>0&&batch.cpuMs>0?
          batch.cpuMs/baseline.cpuMs:null;
        const guardedCpuRatio=baseline.cpuMs>0&&guarded.cpuMs>0?
          guarded.cpuMs/baseline.cpuMs:null;
        if(serialWallRatio>2.5)serialOverWall++;
        if(batchWallRatio>2.5)batchOverWall++;
        if(serialCpuRatio===null)serialUnresolvedCpu++;
        else{
          if(serialCpuRatio>2.5)serialOverCpu++;
          serialMaxCpu=Math.max(serialMaxCpu,serialCpuRatio);
        }
        if(batchCpuRatio===null)batchUnresolvedCpu++;
        else{
          if(batchCpuRatio>2.5)batchOverCpu++;
          batchMaxCpu=Math.max(batchMaxCpu,batchCpuRatio);
        }
        if(guardedWallRatio>2.5)guardedOverWall++;
        if(guardedCpuRatio===null)guardedUnresolvedCpu++;
        else{
          if(guardedCpuRatio>2.5)guardedOverCpu++;
          guardedMaxCpu=Math.max(guardedMaxCpu,guardedCpuRatio);
        }
        serialMaxWall=Math.max(serialMaxWall,serialWallRatio);
        batchMaxWall=Math.max(batchMaxWall,batchWallRatio);
        guardedMaxWall=Math.max(guardedMaxWall,guardedWallRatio);
        const record={latencyMs:latency,trial,order,
          nativeMs:baseline.elapsedMs,serialMs:serial.elapsedMs,batchMs:batch.elapsedMs,
          guardedMs:guarded.elapsedMs,
          nativeCpuMs:baseline.cpuMs,serialCpuMs:serial.cpuMs,batchCpuMs:batch.cpuMs,
          guardedCpuMs:guarded.cpuMs,
          serialWallRatio,batchWallRatio,guardedWallRatio,
          serialCpuRatio,batchCpuRatio,guardedCpuRatio};
        records.push(record);
        console.log(JSON.stringify(record));
      }
      const summary={latencyMs:latency,trials,serialOverWall,batchOverWall,guardedOverWall,
        serialOverCpu,batchOverCpu,guardedOverCpu,
        serialUnresolvedCpu,batchUnresolvedCpu,guardedUnresolvedCpu,
        serialMaxWall,batchMaxWall,guardedMaxWall,
        serialMaxCpu:serialUnresolvedCpu===trials?null:serialMaxCpu,
        batchMaxCpu:batchUnresolvedCpu===trials?null:batchMaxCpu,
        guardedMaxCpu:guardedUnresolvedCpu===trials?null:guardedMaxCpu};
      summaries.push(summary);
      console.log(JSON.stringify({summary}));
    }
    const result={runtime:process.version,platform:process.platform,publicSha256,
      blockBytes:BLOCK_BYTES,businessCalls:CALLS,records,summaries};
    return result;
  }finally{
    globalThis.fetch=nativeFetch;
    delete globals.__SCO_BATCH_PRIVATE_HANDLES__;
    if(server){
      const running=server;
      await new Promise((resolve,reject)=>
        running.close(error=>error?reject(error):resolve(undefined)));
    }
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module){
  run().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={run,challenge};
