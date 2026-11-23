'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {randomBytes}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {transformSync}=require('esbuild');
const {partitionScoAsyncGraph,createScoGraphHandler}=require('../src');

/**
 * Capture process-wide user+system CPU. The server and caller share this
 * process in this deliberately bounded localhost measurement.
 * @template T
 * @param {()=>Promise<T>} invoke
 * @returns {Promise<{cpuMs:number,value:T}>}
 */
async function profile(invoke){
  const before=process.cpuUsage();
  const value=await invoke();
  const used=process.cpuUsage(before);
  return {cpuMs:(used.user+used.system)/1000,value};
}

/**
 * An ordinary minified ESM batch RPC transport using the exact protected
 * method IDs and original private ESM runtime as the generated candidate.
 * @param {string} batchMethod
 * @param {string} deriveMethod
 * @returns {string}
 */
function minifiedBatch(batchMethod,deriveMethod){
  const source='export async function batch(calls){'+
    'const wire=calls.map(item=>({method:'+JSON.stringify(deriveMethod)+',args:item.args}));'+
    'const response=await fetch("/obfs/rpc",{method:"POST",credentials:"same-origin",cache:"no-store",'+
    'headers:{"content-type":"application/json"},body:JSON.stringify({method:'+
    JSON.stringify(batchMethod)+',args:[wire]})});'+
    'const payload=await response.json();'+
    'if(!response.ok||payload.ok!==true)throw Error("Remote batch failed");'+
    'return payload.value;}';
  return transformSync(source,{format:'esm',target:'es2022',minify:true}).code;
}

/**
 * Make a generated or ordinary ESM client call through its same-origin
 * endpoint on the local test server. This records the real HTTP overhead.
 * @template T
 * @param {()=>Promise<T>} invoke
 * @param {string} origin
 * @returns {Promise<T>}
 */
async function withOrigin(invoke,origin){
  const previous=globalThis.fetch;
  globalThis.fetch=/** @type {typeof fetch} */ ((input,options)=>
    previous(new URL(String(input),origin),options));
  try{return await invoke();}
  finally{globalThis.fetch=previous;}
}

test('opt-in SCO graph batch preserves eight real private HMAC results and records paired native/client CPU',async()=>{
  const oldKey=process.env.OBFS_SCO_GRAPH_KEY;
  process.env.OBFS_SCO_GRAPH_KEY=randomBytes(32).toString('hex');
  /** @type {http.Server|undefined} */
  let server;
  try{
    const root=path.join(__dirname,'../examples/sco-graph/before');
    const fileNames=['api.mjs','audit.mjs','secret.mjs'];
    const files=await Promise.all(fileNames.map(async filename=>({
      path:filename,sourceType:/** @type {const} */ ('module'),
      code:await fs.readFile(path.join(root,filename),'utf8')
    })));
    const graph=partitionScoAsyncGraph(files,{
      seed:'agent31-sco-graph-batch-cpu-20261123',
      exposedPaths:['api.mjs','audit.mjs'],
      batchPaths:['api.mjs'],maxBatchCalls:8
    });
    const api=await import(pathToFileURL(path.join(root,'api.mjs')).href);
    const audit=await import(pathToFileURL(path.join(root,'audit.mjs')).href);
    const handler=createScoGraphHandler(graph,{
      'api.mjs':api,'audit.mjs':audit
    },{
      authorizeRpc:()=>true,authorizeOperation:()=>true
    });
    server=http.createServer(handler);
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const socket=server.address();
    if(!socket||typeof socket==='string')throw new Error('Missing server address');
    const origin='http://127.0.0.1:'+socket.port;
    const partition=graph.partitions['api.mjs'];
    if(!partition.batchMethod)throw new Error('Missing opted-in batch method');
    const generatedCode=graph.clientFiles.find(file=>file.path==='api.mjs')?.code;
    if(!generatedCode)throw new Error('Missing public facade');
    const generated=await import('data:text/javascript;base64,'+
      Buffer.from(generatedCode).toString('base64'));
    const ordinary=await import('data:text/javascript;base64,'+
      Buffer.from(minifiedBatch(partition.batchMethod,partition.methodNames.derive))
        .toString('base64'));

    /** @type {{native:number[],generated:number[],ordinary:number[]}} */
    const cpu={native:[],generated:[],ordinary:[]};
    for(let trial=0;trial<6;trial++){
      const inputs=Array.from({length:8},(_,index)=>
        Buffer.alloc(16,trial*8+index+1).toString('hex'));
      const native=async()=>{
        /** @type {{ok:true,value:string}[]} */
        const results=[];
        for(const input of inputs)results.push({ok:true,value:await api.derive(input)});
        return results;
      };
      const calls=inputs.map(input=>({name:'derive',args:[input]}));
      const generatedCall=()=>withOrigin(()=>generated.batch(calls),origin);
      const ordinaryCall=()=>withOrigin(()=>ordinary.batch(calls),origin);
      const expected=await native();
      const order=/** @type {('native'|'generated'|'ordinary')[]} */ (
        trial%2===0?['native','generated','ordinary']:
          ['ordinary','generated','native']);
      for(const arm of order){
        const execution=arm==='native'?native:
          arm==='generated'?generatedCall:ordinaryCall;
        const measure=await profile(execution);
        assert.deepEqual(measure.value,expected);
        cpu[arm].push(measure.cpuMs);
      }
    }
    const ratios=cpu.native.map((value,index)=>({
      generatedOverNative:cpu.generated[index]/value,
      ordinaryOverNative:cpu.ordinary[index]/value,
      generatedOverOrdinary:cpu.generated[index]/cpu.ordinary[index]
    }));
    console.log(JSON.stringify({
      experiment:'sco-graph-real-private-hmac-batch',
      originalModuleCount:3,exposedModuleCount:2,batchSize:8,
      HMACRoundsPerCall:12000,trials:6,
      cpuBoundary:'same-process caller+server localhost, initialization excluded',
      cpuMs:cpu,ratios,
      strictGeneratedNativeBreaches:ratios.filter(r=>r.generatedOverNative>2.5).length,
      strictOrdinaryNativeBreaches:ratios.filter(r=>r.ordinaryOverNative>2.5).length,
      performanceClaim:'workload-scoped diagnostic, no universal CPU bound'
    }));
  }finally{
    if(server)await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    if(oldKey===undefined)delete process.env.OBFS_SCO_GRAPH_KEY;
    else process.env.OBFS_SCO_GRAPH_KEY=oldKey;
  }
});
