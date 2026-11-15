'use strict';

const assert=require('node:assert/strict');
const {createHash,randomBytes}=require('node:crypto');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');
const {atomicWrite}=require('../src/atomic');

const ROUNDS=15000;

/** @param {number} index @returns {string} */
function inputAt(index) {
  return createHash('sha256').update('sco-prf-unseen-input-'+index).digest('hex').slice(0,32);
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * A deliberately limited source-blind adversary. It has only the public
 * callable facade. It memorizes responses to authorized chosen inputs and
 * predicts a fixed string for previously unseen inputs. This demonstrates a
 * finite-query attack limitation, not cryptographic security against all
 * adversaries and not inability to forward live queries to the server.
 *
 * @param {{derive:(input:string)=>Promise<string>}} facade
 * @param {string[]} inputs
 * @returns {Promise<{table:Map<string,string>,calls:number}>}
 */
async function memorizeOracle(facade,inputs) {
  const table=new Map();
  for(const input of inputs)table.set(input,await facade.derive(input));
  return {table,calls:inputs.length};
}

/**
 * Compare a 128-bit-input server-private keyed workload with its own local
 * reference. The key is sampled at runtime and is never handed to the attack
 * function or included in any served file, log, or result object.
 *
 * @returns {Promise<{
 *   sourceHidden:boolean,unauthorizedSourceStatus:number,unauthorizedRpcStatus:number,
 *   inputBits:number,keyBits:number,rounds:number,authorizedTrainingQueries:number,
 *   queriedMatches:number,heldoutCases:number,heldoutTableMatches:number,
 *   localSamplesMs:number[],rpcSamplesMs:number[],localMedianMs:number,
 *   rpcMedianMs:number,ratio:number,withinBudget:boolean,protectedClientSourceBytes:number,
 *   runtime:{node:string,platform:string},commit:string,
 *   assumptions:string
 * }>}
 */
async function runPrfChallenge() {
  const keyHex=randomBytes(32).toString('hex');
  const source=[
    "import {createHmac} from 'node:crypto';",
    'const secret=Buffer.from('+JSON.stringify(keyHex)+',"hex");',
    'export async function derive(input){',
    'if(typeof input!=="string"||!/^[0-9a-f]{32}$/.test(input))throw new TypeError("input");',
    'let state=Buffer.from(input,"hex");',
    'for(let i=0;i<'+ROUNDS+';i++)state=createHmac("sha256",secret).update(state).digest();',
    'return state.toString("hex");',
    '}'
  ].join('\n');
  const partition=partitionScoAsyncModule({
    path:'public.mjs',sourceType:'module',code:source
  },{serverOnlyInitialization:true,seed:'sco-prf-'+randomBytes(12).toString('hex')});
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-prf-'));
  /** @type {import('node:http').Server|null} */
  let server=null;
  const nativeFetch=globalThis.fetch;
  try {
    const serverFile=path.join(directory,'server','secret.mjs');
    await atomicWrite(serverFile,source);
    const privateModule=await import(pathToFileURL(serverFile).href);
    const original=/** @type {(input:string)=>Promise<string>} */(privateModule.derive);
    const methods=bindScoModuleExports(partition,privateModule);
    const approved=/** @type {(request:import('node:http').IncomingMessage)=>boolean} */
      (request=>request.headers['x-session']==='approved');
    const handler=createScoHandler([partition.clientFile],{
      remoteMethods:methods,authorizeRead:approved,authorizeRpc:approved,
      authorizeOperation:(request,method,args)=>approved(request) &&
        method===partition.methodNames.derive && args.length===1 &&
        typeof args[0]==='string' && /^[0-9a-f]{32}$/.test(args[0])
    });
    const activeServer=http.createServer(handler);
    server=activeServer;
    await new Promise((resolve,reject)=>{
      activeServer.once('error',reject);
      activeServer.listen(0,'127.0.0.1',resolve);
    });
    const address=activeServer.address();
    assert.ok(address && typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;

    const deniedSource=await nativeFetch(origin+'/obfs/public.mjs');
    assert.equal(deniedSource.status,403);
    const allowedSource=await nativeFetch(origin+'/obfs/public.mjs',{
      headers:{'x-session':'approved'}
    });
    assert.equal(allowedSource.status,200);
    const publicCode=await allowedSource.text();
    assert.ok(!publicCode.includes(keyHex),'Server-only key leaked in served facade');
    assert.ok(!publicCode.includes('createHmac'),'Private implementation leaked');
    assert.ok(!publicCode.includes('15000'),'Private work factor leaked');
    const deniedRpc=await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:partition.methodNames.derive,args:[inputAt(0)]})
    });
    assert.equal(deniedRpc.status,403);

    const publicFile=path.join(directory,'public','client.mjs');
    await atomicWrite(publicFile,publicCode);
    globalThis.fetch=(url,options)=>{
      const headers=new Headers(options?.headers);
      headers.set('x-session','approved');
      return nativeFetch(new URL(String(url),origin),{...options,headers});
    };
    const facade=/** @type {{derive:(input:string)=>Promise<string>}} */
      (await import(pathToFileURL(publicFile).href));

    const training=Array.from({length:12},(_,index)=>inputAt(index));
    const heldout=Array.from({length:24},(_,index)=>inputAt(index+1000));
    const learned=await memorizeOracle(facade,training);
    let queriedMatches=0;
    for(const input of training)if(learned.table.get(input)===await original(input))queriedMatches++;
    assert.equal(queriedMatches,training.length);
    let heldoutTableMatches=0;
    for(const input of heldout) {
      assert.ok(!learned.table.has(input),'Held-out input overlapped a query');
      const guess=learned.table.get(input)??'0'.repeat(64);
      if(guess===await original(input))heldoutTableMatches++;
    }
    assert.equal(heldoutTableMatches,0,
      'The memorization baseline unexpectedly predicted a held-out digest');

    /** @type {number[]} */
    const localSamplesMs=[];
    /** @type {number[]} */
    const rpcSamplesMs=[];
    const timed=Array.from({length:3},(_,index)=>inputAt(index+2000));
    for(let iteration=0;iteration<5;iteration++) {
      const startLocal=performance.now();
      const expected=[];
      for(const input of timed)expected.push(await original(input));
      localSamplesMs.push(performance.now()-startLocal);
      const startRpc=performance.now();
      const actual=[];
      for(const input of timed)actual.push(await facade.derive(input));
      rpcSamplesMs.push(performance.now()-startRpc);
      assert.deepEqual(actual,expected);
    }
    const localMedianMs=median(localSamplesMs);
    const rpcMedianMs=median(rpcSamplesMs);
    const ratio=rpcMedianMs/localMedianMs;
    return {
      sourceHidden:true,
      unauthorizedSourceStatus:deniedSource.status,
      unauthorizedRpcStatus:deniedRpc.status,
      inputBits:128,keyBits:256,rounds:ROUNDS,
      authorizedTrainingQueries:learned.calls,queriedMatches,
      heldoutCases:heldout.length,heldoutTableMatches,
      localSamplesMs,rpcSamplesMs,localMedianMs,rpcMedianMs,
      ratio,withinBudget:ratio<=2.5,
      protectedClientSourceBytes:Buffer.byteLength(publicCode),
      runtime:{node:process.version,platform:process.platform},
      commit:process.env.GITHUB_SHA??'local',
      assumptions:'Runtime-random key; trusted server; attacker sees facade and allowed responses; memorization-only attack; same-process loopback benchmark; no WAN/TLS/browser or general cryptanalysis.'
    };
  } finally {
    globalThis.fetch=nativeFetch;
    if(server) {
      const activeServer=server;
      await new Promise((resolve,reject)=>activeServer.close(error=>error?reject(error):resolve()));
    }
    await fs.rm(directory,{recursive:true,force:true});
  }
}

if(require.main===module) {
  runPrfChallenge().then(result=>{
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }).catch(error=>{
    console.error(error);
    process.exitCode=1;
  });
}

module.exports={inputAt,memorizeOracle,runPrfChallenge};
