'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');

/**
 * Server-private source has a fresh random 256-bit key, and a coarse 8 MiB
 * HMAC workload. The authenticated client gets only generated RPC stubs.
 */
const PRIVATE_SOURCE=[
  "import {createHmac,randomBytes} from 'node:crypto';",
  'const secretKey=randomBytes(32);',
  'const workload=Buffer.alloc(8*1024*1024,0x5a);',
  'export async function authenticate(challenge){',
  "if(typeof challenge!=='string'||!/^[a-f0-9]{32}$/.test(challenge))throw TypeError('Invalid challenge');",
  "return createHmac('sha256',secretKey).update('sco-opaque-v1').update(challenge).update(workload).digest('hex');",
  '}'
].join('\n');

/** @param {number[]} values @returns {number} */
function median(values) {
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/** @param {string} kind @param {number} index @returns {string} */
function challenge(kind,index) {
  return createHash('sha256').update(kind+'/'+index).digest('hex').slice(0,32);
}

/** @returns {Promise<object>} */
async function experiment() {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-large-domain-'));
  /** @type {http.Server|null} */
  let server=null;
  try {
    const privatePath=path.join(root,'private.mjs');
    await atomicWrite(privatePath,PRIVATE_SOURCE);
    const names=await import(pathToFileURL(privatePath).href);
    const privateFunction=/** @type {(value:string)=>Promise<string>} */ (names.authenticate);
    const partition=partitionScoAsyncModule({
      path:'public.mjs',sourceType:'module',code:PRIVATE_SOURCE
    },{seed:'sco-large-domain-prf-2026-11-15',
      serverOnlyInitialization:true,batch:true,maxBatchCalls:32});
    let executions=0;
    const instrumented={
      /** @param {string} input */
      authenticate:async input=>{executions++;return privateFunction(input);}
    };
    const methods=bindScoModuleExports(partition,instrumented);
    /** @param {http.IncomingMessage} request */
    const authorized=request=>request.headers['x-session']==='approved';
    /** @param {http.IncomingMessage} request @param {string} method @param {unknown[]} args */
    function operationAuthorized(request,method,args) {
      if(!authorized(request))return false;
      if(method===partition.batchMethod) return args.length===1 &&
        Array.isArray(args[0]) && args[0].length>=1 && args[0].length<=32;
      return method===partition.methodNames.authenticate && args.length===1 &&
        typeof args[0]==='string' && /^[a-f0-9]{32}$/.test(args[0]);
    }
    server=http.createServer(createScoHandler([partition.clientFile],{
      remoteMethods:methods,authorizeRead:authorized,
      authorizeRpc:authorized,authorizeOperation:operationAuthorized
    }));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    assert.ok(address && typeof address==='object');
    const rootUrl='http://127.0.0.1:'+address.port+'/obfs/';
    const authorizedRead=await fetch(rootUrl+'public.mjs',{
      headers:{'x-session':'approved'}
    });
    assert.equal(authorizedRead.status,200);
    const publicClient=await authorizedRead.text();
    assert.ok(!publicClient.includes('createHmac'));
    assert.ok(!publicClient.includes('secretKey'));
    assert.ok(!publicClient.includes('workload'));
    const deniedRead=await fetch(rootUrl+'public.mjs');
    assert.equal(deniedRead.status,403);

    /**
     * Real HTTP endpoint available to legitimate attackers.
     * @param {string} method
     * @param {unknown[]} args
     * @param {boolean} [allow]
     * @returns {Promise<{status:number,payload:any}>}
     */
    async function invoke(method,args,allow=true) {
      const response=await fetch(rootUrl+'rpc',{
        method:'POST',
        headers:{'content-type':'application/json',
          ...(allow?{'x-session':'approved'}:{})},
        body:JSON.stringify({method,args})
      });
      return {status:response.status,payload:await response.json()};
    }
    const beforeDenied=executions;
    const denied=await invoke(partition.methodNames.authenticate,[challenge('train',0)],false);
    assert.equal(denied.status,403);
    const deniedExecuted=executions-beforeDenied;
    assert.equal(deniedExecuted,0);

    const train=Array.from({length:64},(_,i)=>challenge('train',i));
    const held=Array.from({length:64},(_,i)=>challenge('held',i));
    assert.equal(new Set([...train,...held]).size,128);
    /** @type {Map<string,string>} */
    const transcript=new Map();
    for(const value of train) {
      const response=await invoke(partition.methodNames.authenticate,[value]);
      assert.equal(response.status,200);
      assert.equal(response.payload.ok,true);
      assert.match(response.payload.value,/^[a-f0-9]{64}$/);
      transcript.set(value,response.payload.value);
    }
    assert.equal(transcript.size,64);
    const heldoutKnown=held.filter(value=>transcript.has(value)).length;
    assert.equal(heldoutKnown,0);
    for(const input of train)assert.equal(transcript.get(input),await privateFunction(input));

    const inputs=Array.from({length:12},(_,i)=>challenge('measure',i));
    const expected=[];
    for(const input of inputs)expected.push(await privateFunction(input));
    for(let warm=0;warm<3;warm++) {
      const result=await invoke(partition.methodNames.authenticate,[inputs[warm]]);
      assert.equal(result.status,200);
      assert.equal(result.payload.value,expected[warm]);
    }
    /** @type {number[]} */
    const nativeMs=[];
    /** @type {number[]} */
    const serialMs=[];
    /** @type {number[]} */
    const batchMs=[];
    for(let round=0;round<9;round++) {
      const order=[
        ['native','serial','batch'],
        ['batch','native','serial'],
        ['serial','batch','native']
      ][round%3];
      for(const current of order) {
        const start=performance.now();
        /** @type {string[]} */
        let received=[];
        if(current==='native') {
          for(const input of inputs)received.push(await privateFunction(input));
          nativeMs.push(performance.now()-start);
        } else if(current==='serial') {
          for(const input of inputs) {
            const result=await invoke(partition.methodNames.authenticate,[input]);
            assert.equal(result.status,200);
            received.push(result.payload.value);
          }
          serialMs.push(performance.now()-start);
        } else {
          const requests=inputs.map(input=>({
            method:partition.methodNames.authenticate,args:[input]
          }));
          const result=await invoke(/** @type {string} */(partition.batchMethod),[requests]);
          assert.equal(result.status,200);
          assert.equal(result.payload.ok,true);
          received=result.payload.value.map(
            (/** @type {{ok:boolean,value:string}} */ entry)=>{
              assert.equal(entry.ok,true);
              return entry.value;
            }
          );
          batchMs.push(performance.now()-start);
        }
        assert.deepEqual(received,expected,'SCO result differed from original');
      }
    }
    const native=median(nativeMs);
    const serial=median(serialMs);
    const batch=median(batchMs);
    return {
      node:process.version,platform:process.platform,
      privateSourceSHA256:createHash('sha256').update(PRIVATE_SOURCE).digest('hex'),
      publicStubBytes:Buffer.byteLength(publicClient),
      serverPrivateKeyBytes:32,domainBits:128,
      authenticatedTrainingQueries:train.length,
      previouslyUnqueriedHeldoutInputs:held.length,
      heldoutInLookup:heldoutKnown,
      transcriptExactTrainingMatches:train.length,
      deniedHttpStatus:denied.status,deniedExecuted,
      nativeMedianMs:native,serialMedianMs:serial,batchMedianMs:batch,
      serialRatio:serial/native,batchRatio:batch/native,
      serialWithin2_5x:serial/native<=2.5,batchWithin2_5x:batch/native<=2.5,
      nativeSamplesMs:nativeMs,serialSamplesMs:serialMs,batchSamplesMs:batchMs,
      caveat:'Only offline transcript replay tested. Authorized online calls are unlimited, and actual RTT/TLS and key-guessing success were not measured. Loopback CPU-heavy HMAC is a positive control, not a PRF proof.'
    };
  }finally{
    if(server)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module) {
  experiment().then(value=>console.log(JSON.stringify(value,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={experiment};
