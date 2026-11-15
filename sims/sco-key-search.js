'use strict';

const assert=require('node:assert/strict');
const {createHmac,randomBytes}=require('node:crypto');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');
const {atomicWrite}=require('../src/atomic');

const CANDIDATES=65536;

/** @param {Buffer} key @param {string} value @returns {string} */
function digest(key,value) {
  return createHmac('sha256',key).update(Buffer.from(value,'hex')).digest('hex');
}

/**
 * Attacker knows the algorithm and the full low-entropy 16-bit key format,
 * but sees only the real permitted server response. The strong-key service
 * is evaluated against exactly the same deliberately limited dictionary.
 *
 * @param {(input:string)=>Promise<string>} invoke
 * @param {string} chosen
 * @returns {Promise<{candidateKeys:Buffer[],requests:number,guesses:number}>}
 */
async function exhaustWeakKeySpace(invoke,chosen) {
  const observed=await invoke(chosen);
  /** @type {Buffer[]} */
  const candidateKeys=[];
  for(let i=0;i<CANDIDATES;i++) {
    const key=Buffer.alloc(2);
    key.writeUInt16BE(i);
    if(digest(key,chosen)===observed)candidateKeys.push(key);
  }
  return {candidateKeys,requests:1,guesses:CANDIDATES};
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @param {Buffer} key @returns {string} */
function privateSource(key) {
  return [
    "import {createHmac} from 'node:crypto';",
    "const serverKey=Buffer.from("+JSON.stringify(key.toString('hex'))+",'hex');",
    'export async function digest(input){',
    'if(typeof input!=="string"||!/^[0-9a-f]{32}$/.test(input))throw TypeError("input");',
    'return createHmac("sha256",serverKey).update(Buffer.from(input,"hex")).digest("hex");',
    '}'
  ].join('\n');
}

/**
 * Run the same source-blind dictionary attack against a weak and a strong
 * server-owned key, through genuine generated SCO ESM facades.
 *
 * @returns {Promise<{
 *   weakKeyBits:number,strongKeyBits:number,candidateGuesses:number,
 *   authorizedOracleQueries:number,weakCandidates:number,strongCandidates:number,
 *   weakHeldoutExact:number,heldoutCount:number,
 *   sourceHidden:boolean,unauthorizedRpcStatus:number,
 *   localMedianMs:number,rpcMedianMs:number,ratio:number,withinBudget:boolean,
 *   runtime:{node:string,platform:string},commit:string,scope:string
 * }>}
 */
async function runKeySearch() {
  const weakSecret=randomBytes(2);
  const strongSecret=randomBytes(32);
  const weakSource=privateSource(weakSecret);
  const strongSource=privateSource(strongSecret);
  const weakPartition=partitionScoAsyncModule({path:'weak.mjs',code:weakSource,sourceType:'module'},{
    seed:'weak-key-sco-'+randomBytes(8).toString('hex'),serverOnlyInitialization:true
  });
  const strongPartition=partitionScoAsyncModule({path:'strong.mjs',code:strongSource,sourceType:'module'},{
    seed:'strong-key-sco-'+randomBytes(8).toString('hex'),serverOnlyInitialization:true
  });
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-key-search-'));
  /** @type {import('node:http').Server|null} */
  let server=null;
  const nativeFetch=globalThis.fetch;
  try {
    const weakPrivateFile=path.join(directory,'server','weak.mjs');
    const strongPrivateFile=path.join(directory,'server','strong.mjs');
    await atomicWrite(weakPrivateFile,weakSource);
    await atomicWrite(strongPrivateFile,strongSource);
    const weakServer=await import(pathToFileURL(weakPrivateFile).href);
    const strongServer=await import(pathToFileURL(strongPrivateFile).href);
    const weakOriginal=/** @type {(input:string)=>Promise<string>} */ (weakServer.digest);
    const weakMethods=bindScoModuleExports(weakPartition,weakServer);
    const strongMethods=bindScoModuleExports(strongPartition,strongServer);
    const weakMethod=weakPartition.methodNames.digest;
    const strongMethod=strongPartition.methodNames.digest;
    /** @param {import('node:http').IncomingMessage} request */
    const approved=request=>request.headers['x-session']==='approved';
    const handler=createScoHandler([weakPartition.clientFile,strongPartition.clientFile],{
      remoteMethods:{...weakMethods,...strongMethods},
      authorizeRpc:approved,authorizeRead:approved,
      authorizeOperation:(request,method,args)=>approved(request)&&
        (method===weakMethod||method===strongMethod)&&args.length===1 &&
        typeof args[0]==='string'&&/^[0-9a-f]{32}$/.test(args[0])
    });
    const activeServer=http.createServer(handler);
    server=activeServer;
    /** @type {Promise<void>} */
    const ready=new Promise((resolve,reject)=>{
      activeServer.once('error',reject);
      activeServer.listen(0,'127.0.0.1',()=>resolve());
    });
    await ready;
    const address=activeServer.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    const files=[
      {partition:weakPartition,name:'weak.mjs'},
      {partition:strongPartition,name:'strong.mjs'}
    ];
    let sourceHidden=true;
    for(const item of files) {
      const response=await nativeFetch(origin+'/obfs/'+item.name,{
        headers:{'x-session':'approved'}
      });
      assert.equal(response.status,200);
      const code=await response.text();
      if(code.includes('createHmac')||code.includes('serverKey'))sourceHidden=false;
      const publicFile=path.join(directory,'public',item.name);
      await atomicWrite(publicFile,code);
    }
    assert.ok(sourceHidden,'A private implementation identifier appeared publicly');
    const deniedRpc=await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:weakMethod,args:['0'.repeat(32)]})
    });
    assert.equal(deniedRpc.status,403);

    globalThis.fetch=(url,options)=>{
      const headers=new Headers(options?.headers);
      headers.set('x-session','approved');
      return nativeFetch(new URL(String(url),origin),{...options,headers});
    };
    const weakFacade=/** @type {{digest:(input:string)=>Promise<string>}} */
      (await import(pathToFileURL(path.join(directory,'public','weak.mjs')).href));
    const strongFacade=/** @type {{digest:(input:string)=>Promise<string>}} */
      (await import(pathToFileURL(path.join(directory,'public','strong.mjs')).href));
    const chosen='ab'.repeat(16);
    const weak=await exhaustWeakKeySpace(weakFacade.digest,chosen);
    const strong=await exhaustWeakKeySpace(strongFacade.digest,chosen);
    assert.equal(weak.candidateKeys.length,1,'Expected exactly one weak-key preimage');
    assert.equal(strong.candidateKeys.length,0,'Found strong key in two-byte dictionary');

    const heldout=Array.from({length:32},(_,index)=>index.toString(16).padStart(32,'0'));
    let weakHeldoutExact=0;
    for(const input of heldout) {
      const predicted=digest(weak.candidateKeys[0],input);
      if(predicted===await weakFacade.digest(input))weakHeldoutExact++;
    }
    assert.equal(weakHeldoutExact,heldout.length);

    /** @type {number[]} */
    const localSamplesMs=[];
    /** @type {number[]} */
    const rpcSamplesMs=[];
    const timed=heldout.slice(0,20);
    for(let round=0;round<5;round++) {
      /** @type {string[]} */
      let direct=[];
      /** @type {string[]} */
      let throughRpc=[];
      const startLocal=performance.now();
      for(const input of timed)direct.push(await weakOriginal(input));
      localSamplesMs.push(performance.now()-startLocal);
      const startRpc=performance.now();
      for(const input of timed)throughRpc.push(await weakFacade.digest(input));
      rpcSamplesMs.push(performance.now()-startRpc);
      assert.deepEqual(throughRpc,direct);
    }
    const localMedianMs=median(localSamplesMs);
    const rpcMedianMs=median(rpcSamplesMs);
    const ratio=rpcMedianMs/localMedianMs;
    return {
      weakKeyBits:16,strongKeyBits:256,candidateGuesses:CANDIDATES,
      authorizedOracleQueries:weak.requests+strong.requests+heldout.length+5*20,
      weakCandidates:weak.candidateKeys.length,strongCandidates:strong.candidateKeys.length,
      weakHeldoutExact,heldoutCount:heldout.length,
      sourceHidden,unauthorizedRpcStatus:deniedRpc.status,
      localMedianMs,rpcMedianMs,ratio,withinBudget:ratio<=2.5,
      runtime:{node:process.version,platform:process.platform},
      commit:process.env.GITHUB_SHA??'local',
      scope:'One known 16-bit key dictionary and 256-bit random key; known one-round HMAC algorithm; offline guesses; loopback only.'
    };
  } finally {
    globalThis.fetch=nativeFetch;
    if(server){
      const activeServer=server;
      /** @type {Promise<void>} */
      const closed=new Promise((resolve,reject)=>
        activeServer.close(error=>error?reject(error):resolve()));
      await closed;
    }
    await fs.rm(directory,{recursive:true,force:true});
  }
}

if(require.main===module) {
  runKeySearch().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={exhaustWeakKeySpace,runKeySearch};
