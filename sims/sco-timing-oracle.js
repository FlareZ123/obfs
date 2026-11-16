'use strict';

const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {promisify}=require('node:util');
const {execFile}=require('node:child_process');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');
const {atomicWrite}=require('../src/atomic');

const execFileAsync=promisify(execFile);

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Demonstrate that client-visible RPC timing can leak a server-only value
 * even when the source and 128-bit secret are never served. The intentionally
 * vulnerable private routine spends 2 ms per matching hexadecimal digit;
 * the fixed control uses timingSafeEqual and independent fixed work.
 *
 * The attacker runs in a separate Node process with only an authorized
 * public facade and the normal HTTP endpoint. No test-only prefix count,
 * secret oracle, file path or private-source bytes are passed to it.
 *
 * @returns {Promise<{
 * sourceHidden:boolean,secretBits:number,probesPerMode:number,
 * recoveredSecret:boolean,constantTimeControlRecovered:boolean,
 * vulnerableFinalAccepted:boolean,controlFinalAccepted:boolean,
 * attackMarginMs:number,facadeBytes:number,
 * directUnauthorizedStatus:number,unauthorizedExecutions:number,
 * nativeMs:number,rpcMs:number,validCallRatio:number,within2_5x:boolean,
 * runtime:{node:string,platform:string}
 * }>}
 */
async function runTimingOracleExperiment(){
  const secret=randomBytes(16).toString('hex');
  const privateSource=[
    "import {timingSafeEqual} from 'node:crypto';",
    'const secret='+JSON.stringify(secret)+';',
    'const secretBytes=Buffer.from(secret,"hex");',
    'function pad(){const deadline=performance.now()+2;while(performance.now()<deadline){}}',
    'export async function verify(candidate){',
    'if(typeof candidate!=="string"||!/^[0-9a-f]{32}$/.test(candidate))return false;',
    'for(let index=0;index<secret.length;index++){',
    'if(candidate[index]!==secret[index])return false;',
    'pad();',
    '}return true;',
    '}',
    'export async function verifyFixed(candidate){',
    'if(typeof candidate!=="string"||!/^[0-9a-f]{32}$/.test(candidate))return false;',
    'const accepted=timingSafeEqual(Buffer.from(candidate,"hex"),secretBytes);',
    'pad();return accepted;',
    '}'
  ].join('\n');
  const publicPartition=partitionScoAsyncModule({
    path:'public.mjs',sourceType:'module',code:privateSource
  },{
    seed:'sco-timing-oracle-'+randomBytes(8).toString('hex'),
    serverOnlyInitialization:true
  });
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-timing-oracle-'));
  /** @type {http.Server|null} */
  let server=null;
  try{
    const originalPath=path.join(root,'trusted','private.mjs');
    await atomicWrite(originalPath,privateSource);
    const trusted=await import(pathToFileURL(originalPath).href);
    const remoteMethods=bindScoModuleExports(publicPartition,trusted);
    let executions=0;
    for(const methodName of Object.keys(remoteMethods)){
      const task=remoteMethods[methodName];
      remoteMethods[methodName]=async(...args)=>{
        executions++;
        return await task(...args);
      };
    }
    /** @param {http.IncomingMessage} request @returns {boolean} */
    const permitted=request=>request.headers['x-session']==='approved';
    const knownMethods=new Set(Object.values(publicPartition.methodNames));
    const handler=createScoHandler([publicPartition.clientFile],{
      publicPaths:['public.mjs'],
      remoteMethods,
      authorizeRpc:permitted,authorizeRead:permitted,
      authorizeOperation:(request,method,args)=>permitted(request)&&
        knownMethods.has(method)&&args.length===1&&
        typeof args[0]==='string'&&/^[0-9a-f]{32}$/.test(args[0])
    });
    server=http.createServer(handler);
    const active=server;
    await new Promise((resolve,reject)=>{
      active.once('error',reject);
      active.listen(0,'127.0.0.1',()=>resolve());
    });
    const address=active.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    const denied=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:publicPartition.methodNames.verify,args:['0'.repeat(32)]})
    });
    assert.equal(denied.status,403);
    const unauthorizedExecutions=executions;
    assert.equal(unauthorizedExecutions,0);
    const publicResponse=await fetch(origin+'/obfs/public.mjs',{
      headers:{'x-session':'approved'}
    });
    assert.equal(publicResponse.status,200);
    const publicCode=await publicResponse.text();
    assert.ok(!publicCode.includes(secret));
    assert.ok(!publicCode.includes('timingSafeEqual'));
    assert.ok(!publicCode.includes('pad()'));
    assert.ok(!publicCode.includes('secretBytes'));

    // The attack process is given only a routable URL and its own approved
    // test session. The trusted key is retained exclusively by this process.
    const child=path.join(__dirname,'sco-timing-oracle-child.js');
    const {stdout}=await execFileAsync(process.execPath,[child,origin,'approved'],{
      encoding:'utf8',timeout:420000,maxBuffer:2*1024*1024
    });
    const attack=JSON.parse(stdout.trim());
    assert.equal(attack.sourceReadOnly,true);
    assert.equal(attack.vulnerable.requests,1537);
    assert.equal(attack.fixed.requests,1537);
    assert.equal(attack.vulnerable.verified,true,
      'Authorized timing attacker failed to complete private verification');
    assert.equal(attack.vulnerable.guess,secret,
      'Public HTTP timing reconstruction differs from trusted secret');
    assert.equal(attack.fixed.verified,false,
      'Control unexpectedly revealed the server secret');

    /** @param {string} method @param {string} candidate @returns {Promise<boolean>} */
    async function invoke(method,candidate){
      const response=await fetch(origin+'/obfs/rpc',{
        method:'POST',
        headers:{'content-type':'application/json','x-session':'approved'},
        body:JSON.stringify({method,args:[candidate]})
      });
      assert.equal(response.status,200);
      const payload=await response.json();
      assert.equal(payload.ok,true);
      return Boolean(payload.value);
    }
    /** @type {number[]} */
    const nativeSamples=[];
    /** @type {number[]} */
    const rpcSamples=[];
    for(let round=0;round<5;round++){
      const order=round%2?['rpc','native']:['native','rpc'];
      for(const variant of order){
        const start=performance.now();
        for(let repetition=0;repetition<3;repetition++){
          const result=variant==='native'?
            await trusted.verify(secret):
            await invoke(publicPartition.methodNames.verify,secret);
          assert.equal(result,true);
        }
        (variant==='native'?nativeSamples:rpcSamples).push(
          performance.now()-start);
      }
    }
    const nativeMs=median(nativeSamples),rpcMs=median(rpcSamples);
    return {
      sourceHidden:true,secretBits:128,
      probesPerMode:attack.vulnerable.requests,
      recoveredSecret:attack.vulnerable.guess===secret,
      constantTimeControlRecovered:attack.fixed.guess===secret,
      vulnerableFinalAccepted:attack.vulnerable.verified,
      controlFinalAccepted:attack.fixed.verified,
      attackMarginMs:attack.vulnerable.minMarginMs,
      facadeBytes:attack.publicFacadeBytes,
      directUnauthorizedStatus:denied.status,
      unauthorizedExecutions,nativeMs,rpcMs,
      validCallRatio:rpcMs/nativeMs,within2_5x:rpcMs/nativeMs<=2.5,
      runtime:{node:process.version,platform:process.platform}
    };
  }finally{
    if(server)await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module){
  runTimingOracleExperiment().then(value=>{
    process.stdout.write('SCO_TIMING_ORACLE '+JSON.stringify(value)+'\n');
  }).catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={runTimingOracleExperiment};
