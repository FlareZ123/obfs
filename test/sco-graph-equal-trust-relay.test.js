'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {randomBytes}=require('node:crypto');
const {transformSync}=require('esbuild');
const {bindScoGraphExports}=require('../src');
const {startServer}=require('../examples/sco-graph/server.cjs');

/**
 * An ordinary minified public RPC client. It intentionally has the same
 * transport and method IDs as the compiler-generated SCO client, and neither
 * public client contains the original private HMAC implementation.
 * @param {string} name
 * @param {string} method
 * @param {string[]} params
 * @returns {string}
 */
function ordinaryFacade(name,method,params){
  const inputs=params.join(',');
  const args=params.join(',');
  const source='export async function '+name+'('+inputs+'){'+
    'const response=await fetch("/obfs/rpc",{method:"POST",credentials:"same-origin",cache:"no-store",'+
    'headers:{"content-type":"application/json"},body:JSON.stringify({method:'+
    JSON.stringify(method)+',args:['+args+']})});'+
    'const result=await response.json();'+
    'if(!response.ok||result.ok!==true)throw Error("Remote operation failed");'+
    'return result.value;}';
  return transformSync(source,{format:'esm',minify:true,target:'es2022'}).code;
}

/**
 * Start a deliberately conventional, authenticated private HTTP service.
 * The same original ESM namespaces and secret are used by both servers.
 * @param {Record<string,(...args:any[])=>unknown|Promise<unknown>>} methods
 * @param {Record<string,string>} publicFiles
 * @param {string} token
 * @returns {Promise<{server:http.Server,origin:string}>}
 */
async function startOrdinary(methods,publicFiles,token){
  const server=http.createServer(async(request,response)=>{
    const address=request.url??'';
    if(request.headers['x-demo-token']!==token){
      response.writeHead(403).end();
      return;
    }
    if(request.method==='GET'){
      const text=publicFiles[address];
      if(text===undefined){response.writeHead(404).end();return;}
      response.writeHead(200,{'content-type':'text/javascript'}).end(text);
      return;
    }
    if(request.method!=='POST'||address!=='/obfs/rpc'){
      response.writeHead(404).end();
      return;
    }
    try {
      let body='';
      for await(const chunk of request)body+=String(chunk);
      const parsed=JSON.parse(body);
      const method=parsed.method;
      const args=parsed.args;
      if(typeof method!=='string'||!Object.hasOwn(methods,method)||
          !Array.isArray(args)||args.length>2||
          !args.every(/** @param {unknown} item */ item=>typeof item==='string')){
        response.writeHead(403).end();
        return;
      }
      const value=await methods[method](...args);
      response.writeHead(200,{'content-type':'application/json'}).end(
        JSON.stringify({ok:true,value}));
    }catch{
      response.writeHead(500,{'content-type':'application/json'}).end(
        JSON.stringify({ok:false}));
    }
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Missing service address');
  return {server,origin:'http://127.0.0.1:'+address.port};
}

/**
 * Execute an emitted ESM client under a user's instrumented fetch.
 * The attacker can read its outbound RPC method and arguments.
 * @param {(input:string)=>Promise<string>} invoke
 * @param {string} origin
 * @param {string} token
 * @param {string} input
 * @returns {Promise<{value:string,wire:{method:string,args:string[]}}>}
 */
async function captureClient(invoke,origin,token,input){
  const actualFetch=globalThis.fetch;
  /** @type {{method:string,args:string[]}|undefined} */
  let wire;
  globalThis.fetch=/** @type {typeof fetch} */ ((url,init)=>{
    if(!init||typeof init.body!=='string')throw new Error('Expected outbound RPC');
    wire=JSON.parse(init.body);
    return actualFetch(new URL(String(url),origin),{
      ...init,headers:{...init.headers,'x-demo-token':token}
    });
  });
  try {
    const value=await invoke(input);
    if(!wire)throw new Error('Client did not issue an observable RPC');
    return {value,wire};
  }finally{
    globalThis.fetch=actualFetch;
  }
}

/**
 * Send the intercepted method to a live server, with or without the
 * legitimate account token. The original protected function is never copied.
 * @param {string} origin
 * @param {string} method
 * @param {string[]} args
 * @param {string|undefined} token
 * @returns {Promise<Response>}
 */
function postCaptured(origin,method,args,token){
  return fetch(origin+'/obfs/rpc',{
    method:'POST',
    headers:{'content-type':'application/json',...(token?{'x-demo-token':token}:{})},
    body:JSON.stringify({method,args})
  });
}

/**
 * Node process-wide CPU for one sequential operation. This includes the
 * trusted loopback server and caller in the same process, and excludes the
 * prior server initialization. It is not a client-only CPU measurement.
 * @param {()=>Promise<string>} execute
 * @returns {Promise<{cpuMs:number,result:string}>}
 */
async function sampleCpu(execute){
  const before=process.cpuUsage();
  const result=await execute();
  const usage=process.cpuUsage(before);
  return {cpuMs:(usage.user+usage.system)/1000,result};
}

test('real multi-module private SCO graph and equal-trust minified client allow the same authorized online relay',async()=>{
  const oldKey=process.env.OBFS_SCO_GRAPH_KEY;
  process.env.OBFS_SCO_GRAPH_KEY=randomBytes(32).toString('hex');
  /** @type {Awaited<ReturnType<typeof startServer>>|undefined} */
  let sco;
  /** @type {Awaited<ReturnType<typeof startOrdinary>>|undefined} */
  let ordinary;
  try{
    const token=randomBytes(24).toString('hex');
    sco=await startServer({token});
    const graph=sco.graph;
    const before=path.join(__dirname,'../examples/sco-graph/before');
    const api=await import(pathToFileURL(path.join(before,'api.mjs')).href);
    const audit=await import(pathToFileURL(path.join(before,'audit.mjs')).href);
    const methods=bindScoGraphExports(graph,{'api.mjs':api,'audit.mjs':audit});
    const deriveMethod=graph.partitions['api.mjs'].methodNames.derive;
    const verifyMethod=graph.partitions['audit.mjs'].methodNames.verify;
    const clientSources={
      '/obfs/api.mjs':ordinaryFacade('derive',deriveMethod,['value']),
      '/obfs/audit.mjs':ordinaryFacade('verify',verifyMethod,['value','digest'])
    };
    ordinary=await startOrdinary(methods,clientSources,token);

    for(const current of [sco.origin,ordinary.origin]){
      assert.equal((await fetch(current+'/obfs/api.mjs')).status,403);
      assert.equal((await fetch(current+'/obfs/secret.mjs',{
        headers:{'x-demo-token':token}
      })).status,404);
      const response=await fetch(current+'/obfs/api.mjs',{
        headers:{'x-demo-token':token}
      });
      assert.equal(response.status,200);
      const publicBytes=await response.text();
      assert.ok(!publicBytes.includes(process.env.OBFS_SCO_GRAPH_KEY));
      assert.ok(!publicBytes.includes('PRIVATE_GRAPH_SOURCE_CANARY_631744'));
      assert.ok(!publicBytes.includes('calculateDigest'));
    }

    const emitted=await import(pathToFileURL(path.join(
      __dirname,'../examples/sco-graph/after/api.mjs')).href);
    const ordinaryImported=await import('data:text/javascript;base64,'+
      Buffer.from(clientSources['/obfs/api.mjs']).toString('base64'));
    const knownInput=randomBytes(16).toString('hex');
    const scoObservation=await captureClient(emitted.derive,sco.origin,token,knownInput);
    const normalObservation=await captureClient(
      ordinaryImported.derive,ordinary.origin,token,knownInput);
    assert.equal(scoObservation.value,normalObservation.value);
    assert.equal(scoObservation.wire.method,deriveMethod);
    assert.equal(normalObservation.wire.method,deriveMethod);
    assert.deepEqual(scoObservation.wire.args,[knownInput]);
    assert.deepEqual(normalObservation.wire.args,[knownInput]);

    let replayed=0;
    for(let index=0;index<8;index++){
      const input=randomBytes(16).toString('hex');
      const noToken=await postCaptured(sco.origin,scoObservation.wire.method,[input],undefined);
      const noTokenOrdinary=await postCaptured(
        ordinary.origin,normalObservation.wire.method,[input],undefined);
      assert.equal(noToken.status,403);
      assert.equal(noTokenOrdinary.status,403);
      const scoResponse=await postCaptured(sco.origin,scoObservation.wire.method,[input],token);
      const ordinaryResponse=await postCaptured(
        ordinary.origin,normalObservation.wire.method,[input],token);
      assert.equal(scoResponse.status,200);
      assert.equal(ordinaryResponse.status,200);
      const a=await scoResponse.json();
      const b=await ordinaryResponse.json();
      assert.deepEqual(a,b);
      assert.match(a.value,/^[0-9a-f]{64}$/);
      const scoAudit=await postCaptured(sco.origin,verifyMethod,[input,a.value],token);
      const ordinaryAudit=await postCaptured(ordinary.origin,verifyMethod,[input,b.value],token);
      assert.equal(scoAudit.status,200);
      assert.equal(ordinaryAudit.status,200);
      assert.deepEqual(await scoAudit.json(),{ok:true,value:true});
      assert.deepEqual(await ordinaryAudit.json(),{ok:true,value:true});
      replayed++;
    }
    assert.equal(replayed,8);

    // The private HMAC is intentionally heavy, making a sampled
    // caller+server CPU comparison meaningful. Preserve each raw pair rather
    // than using only medians to conceal strict 2.5x counterexamples.
    /** @type {{native:number[],sco:number[],ordinary:number[]}} */
    const cpu={native:[],sco:[],ordinary:[]};
    for(let index=0;index<8;index++){
      const input=Buffer.alloc(16,index+1).toString('hex');
      const expected=await api.derive(input);
      const order=/** @type {('native'|'sco'|'ordinary')[]} */ (
        index%2===0?['native','sco','ordinary']:['ordinary','sco','native']);
      for(const kind of order){
        const sample=await sampleCpu(async()=>{
          if(kind==='native')return await api.derive(input);
          if(kind==='sco')return (await captureClient(emitted.derive,sco.origin,token,input)).value;
          return (await captureClient(
            ordinaryImported.derive,ordinary.origin,token,input)).value;
        });
        assert.equal(sample.result,expected);
        cpu[kind].push(sample.cpuMs);
      }
    }
    const ratios=cpu.native.map((native,index)=>({
      scoOverNative:cpu.sco[index]/native,
      ordinaryOverNative:cpu.ordinary[index]/native,
      scoOverOrdinary:cpu.sco[index]/cpu.ordinary[index]
    }));
    console.log(JSON.stringify({
      experiment:'sco-multimodule-equal-trust-online-relay',
      originalPrivateModules:3,distributedFacades:2,
      publicMinifier:'esbuild',successfulHeldOutRelays:replayed,
      unauthorizedPostStatus:403,privateKeyAbsentFromDistributedText:true,
      processCpuBoundary:'same-process trusted localhost caller and service, after init',
      sampleCount:8,rawCpuMs:cpu,ratios,
      strictBreaches:ratios.filter(item=>item.scoOverNative>2.5).length,
      performanceClaim:'bounded-workload-only'
    }));
  }finally{
    if(ordinary)await new Promise((resolve,reject)=>
      ordinary.server.close(error=>error?reject(error):resolve()));
    if(sco)await new Promise((resolve,reject)=>
      sco.server.close(error=>error?reject(error):resolve()));
    if(oldKey===undefined)delete process.env.OBFS_SCO_GRAPH_KEY;
    else process.env.OBFS_SCO_GRAPH_KEY=oldKey;
  }
});
