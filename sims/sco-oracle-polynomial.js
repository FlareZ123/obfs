'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {randomBytes, randomInt, createHash} = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {pathToFileURL} = require('node:url');
const {partitionScoAsyncModule, bindScoModuleExports, createScoHandler} = require('../src');
const {atomicWrite} = require('../src/atomic');

/** @typedef {{score:(x:number)=>Promise<number>,batch:(calls:{name:string,args:number[]}[])=>Promise<{ok:boolean,value:number}[]>}} PublicApi */

/**
 * Recover a degree-at-most-three polynomial using only authorized browser
 * facade calls. The private coefficients, source, and partition metadata are
 * not inputs to this attacker.
 * @param {PublicApi} api
 * @param {'serial'|'batch'} transport
 * @returns {Promise<{coefficients:number[],observations:number[],elapsedMs:number,httpRequests:number,oracleEvaluations:number}>}
 */
async function recoverPolynomial(api,transport) {
  const xs=[0,1,2,3,4];
  const started=performance.now();
  /** @type {number[]} */
  let observations=[];
  if(transport==='batch') {
    const batch=await api.batch(xs.map(x=>({name:'score',args:[x]})));
    assert.equal(batch.length,xs.length);
    for(const result of batch) {
      assert.equal(result.ok,true);
      assert.equal(typeof result.value,'number');
      observations.push(result.value);
    }
  } else {
    for(const x of xs) observations.push(await api.score(x));
  }
  const elapsedMs=performance.now()-started;
  /** @type {number[][]} */
  const layers=[observations];
  for(let n=0;n<4;n++) {
    const prior=layers[layers.length-1];
    layers.push(prior.slice(1).map((value,i)=>value-prior[i]));
  }
  const [d0,d1,d2,d3,d4]=layers.map(layer=>layer[0]);
  assert.equal(d4,0,'The fifth probe must verify the cubic model');
  const a=d3/6;
  const b=d2/2-3*a;
  const c=d1-a-b;
  const d=d0;
  const coefficients=[a,b,c,d];
  assert.ok(coefficients.every(Number.isSafeInteger));
  return {coefficients,observations,elapsedMs,
    httpRequests:transport==='batch'?1:5,oracleEvaluations:5};
}

/** @param {number[]} coefficients @param {number} x @returns {number} */
function predict(coefficients,x) {
  const [a,b,c,d]=coefficients;
  return ((a*x+b)*x+c)*x+d;
}

/**
 * A trusted server retains a module's implementation. An attacker sees only
 * the generated ESM stub, plus authenticated RPC results on a bounded input
 * domain. A separate evaluator is allowed to compare the recovered function
 * against withheld coefficients and held-out inputs.
 * @param {number} index
 * @returns {Promise<object>}
 */
async function scenario(index) {
  const coefficients=Array.from({length:4},()=>randomInt(-12,13));
  const serverOnlyCanary='server-only-'+randomBytes(16).toString('hex');
  const original=[
    'const secretCoefficients='+JSON.stringify(coefficients)+';',
    'const serverOnlyCanary='+JSON.stringify(serverOnlyCanary)+';',
    'export async function score(x){',
    'if(!Number.isSafeInteger(x)||x<0||x>512)throw TypeError("invalid input");',
    'const [a,b,c,d]=secretCoefficients;',
    'return ((a*x+b)*x+c)*x+d;',
    '}'
  ].join('\n');
  const partition=partitionScoAsyncModule({path:'client.mjs',sourceType:'module',code:original},{
    seed:randomBytes(24).toString('hex'),batch:true,maxBatchCalls:16,
    serverOnlyInitialization:true
  });
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-oracle-'));
  /** @type {import('node:http').Server|null} */
  let server=null;
  const nativeFetch=globalThis.fetch;
  try {
    const originalPath=path.join(directory,'private','original.mjs');
    await atomicWrite(originalPath,original);
    const serverExports=await import(pathToFileURL(originalPath).href);
    server=http.createServer(createScoHandler([partition.clientFile],{
      remoteMethods:bindScoModuleExports(partition,serverExports),
      authorizeRpc:request=>request.headers.cookie==='session=allow',
      authorizeOperation:(request,method,args)=>{
        if(request.headers.cookie!=='session=allow')return false;
        if(method===partition.batchMethod) {
          return args.length===1 && Array.isArray(args[0]) &&
            args[0].length>=1 && args[0].length<=16;
        }
        return method===partition.methodNames.score && args.length===1 &&
          Number.isSafeInteger(args[0]) && args[0]>=0 && args[0]<=512;
      }
    }));
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    assert.ok(address && typeof address==='object');
    const root='http://127.0.0.1:'+address.port;
    const response=await nativeFetch(root+'/obfs/client.mjs');
    assert.equal(response.status,200);
    const publicSource=await response.text();
    assert.ok(!publicSource.includes(serverOnlyCanary));
    assert.ok(!publicSource.includes('secretCoefficients'));
    assert.ok(!publicSource.includes(JSON.stringify(coefficients)));
    const publicPath=path.join(directory,'public','client.mjs');
    await atomicWrite(publicPath,publicSource);
    const forbidden=await nativeFetch(root+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:partition.methodNames.score,args:[2]})
    });
    assert.equal(forbidden.status,403);
    // Emulate the same-origin, authorized fetch environment of a browser.
    globalThis.fetch=(input,options)=>nativeFetch(new URL(String(input),root),{
      ...options,headers:{...options?.headers,cookie:'session=allow'}
    });
    const publicApi=/** @type {PublicApi} */(await import(pathToFileURL(publicPath).href));
    const serial=await recoverPolynomial(publicApi,'serial');
    const batch=await recoverPolynomial(publicApi,'batch');
    assert.deepEqual(serial.coefficients,coefficients);
    assert.deepEqual(batch.coefficients,coefficients);
    const heldout=Array.from({length:101},(_,i)=>i+5);
    for(const x of heldout) {
      const truth=await serverExports.score(x);
      assert.equal(predict(serial.coefficients,x),truth);
      assert.equal(predict(batch.coefficients,x),truth);
    }
    return {
      scenario:index,publicBytes:Buffer.byteLength(publicSource),
      privateBytes:Buffer.byteLength(original),
      privateSha256:createHash('sha256').update(original).digest('hex'),
      sourceDisclosed:false,unauthorizedRequestStatus:forbidden.status,
      attackerAccess:'public ESM stub and authorized JSON RPC only',
      attackerModel:'polynomial degree at most three; exact integers within approved domain',
      recoveredCoefficients:batch.coefficients,
      heldoutCases:heldout.length,heldoutEquivalent:true,
      serial,batch
    };
  } finally {
    globalThis.fetch=nativeFetch;
    if(server)await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/** @returns {Promise<void>} */
async function main() {
  /** @type {object[]} */
  const results=[];
  for(let index=0;index<8;index++)results.push(await scenario(index));
  const report={
    time:new Date().toISOString(),node:process.version,platform:process.platform,
    cpu:os.cpus()[0]?.model,
    methodology:'8 randomized private cubic functions; 5 authorized chosen-input queries per attack; 101 held-out comparisons each; serial versus one request batching',
    securityConclusion:'No static private source disclosure; full functional reconstruction succeeds for this low-dimensional oracle class',
    performanceCaveat:'Loopback request durations only, not a universal 2.5x estimate; no network TLS or real browser',
    results
  };
  await atomicWrite(path.join(process.cwd(),'sco-oracle-polynomial-output.json'),JSON.stringify(report,null,2)+'\n');
  for(const item of results)process.stdout.write(JSON.stringify(item)+'\n');
}
main().catch(error=>{process.stderr.write(String(error?.stack||error)+'\n');process.exitCode=1;});
