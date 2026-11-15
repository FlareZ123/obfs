'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * A deliberately server-resident async ESM operation. Its embedded canary
 * proves that partitioning never needs to publish its private source bytes.
 * The public HTTP oracle is still available to authenticated attackers.
 */
const PRIVATE_SOURCE=[
  'export async function compute(value){',
  ' const privateCanary="SERVER_ONLY_CANARY_b81f74b513a2";',
  ' let state=value|0;',
  ' for(let i=0;i<4096;i++)state=Math.imul(state^(i&255),16777619)|0;',
  ' return (state+privateCanary.length)|0;',
  '}'
].join('\n');

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @returns {Promise<void>} */
async function main() {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-trust-'));
  /** @type {import('node:http').Server|null} */
  let server=null;
  try {
    const privateFile=path.join(directory,'private-original.mjs');
    await atomicWrite(privateFile,PRIVATE_SOURCE);
    const loadedStart=performance.now();
    const exports=await import(pathToFileURL(privateFile).href);
    const importMs=performance.now()-loadedStart;
    const partitionStart=performance.now();
    const partition=partitionScoAsyncModule({
      path:'public.mjs',sourceType:'module',code:PRIVATE_SOURCE
    },{seed:'sco-trust-challenge-2026-11-15',batch:true,maxBatchCalls:16});
    const partitionMs=performance.now()-partitionStart;
    const original=/** @type {(value:number)=>Promise<number>} */(exports.compute);
    let executed=0,protectedWorkMs=0,policyCalls=0,policyMs=0;
    const monitored=/** @type {Record<string,unknown>} */({
      compute:async(/** @type {number} */ value)=>{
        const start=performance.now();
        try{return await original(value);}
        finally{executed++;protectedWorkMs+=performance.now()-start;}
      }
    });
    const methods=bindScoModuleExports(partition,monitored);
    /** @type {(request:import('node:http').IncomingMessage)=>boolean} */
    const allow=request=>request.headers['x-session']==='approved';
    /** @type {(request:import('node:http').IncomingMessage,method:string,args:unknown[])=>boolean} */
    function authorizeOperation(request,method,args) {
      const start=performance.now();
      const validDirect=method===partition.methodNames.compute &&
        args.length===1 && Number.isSafeInteger(args[0]) &&
        /** @type {number} */(args[0])>=0 && /** @type {number} */(args[0])<=65535;
      const validBatch=method===partition.batchMethod && args.length===1 &&
        Array.isArray(args[0]) && args[0].length>=1 && args[0].length<=16;
      const result=allow(request) && (validDirect||validBatch);
      policyCalls++;
      policyMs+=performance.now()-start;
      return result;
    }
    const handler=createScoHandler([partition.clientFile],{
      remoteMethods:methods,authorizeRead:allow,authorizeRpc:allow,authorizeOperation
    });
    server=http.createServer(handler);
    const listenStart=performance.now();
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const listenMs=performance.now()-listenStart;
    const address=server.address();
    if(!address || typeof address==='string')throw new Error('No HTTP listener');
    const root='http://127.0.0.1:'+address.port+'/obfs/';
    const rpcUrl=root+'rpc';
    /** @param {string} method @param {unknown[]} args @param {boolean} authorized */
    async function post(method,args,authorized) {
      return fetch(rpcUrl,{method:'POST',
        headers:{'content-type':'application/json',...(authorized?{'x-session':'approved'}:{})},
        body:JSON.stringify({method,args})});
    }
    const deniedSource=await fetch(root+'public.mjs');
    assert.equal(deniedSource.status,403);
    const allowedSource=await fetch(root+'public.mjs',{headers:{'x-session':'approved'}});
    assert.equal(allowedSource.status,200);
    const publicText=await allowedSource.text();
    const canary='SERVER_ONLY_CANARY_b81f74b513a2';
    assert.ok(!publicText.includes(canary),'Private literal leaked in public facade');
    assert.ok(!publicText.includes('16777619'),'Private arithmetic leaked in public facade');
    const deniedRpc=await post(partition.methodNames.compute,[3],false);
    assert.equal(deniedRpc.status,403);
    const deniedUnknown=await post('arbitrary-method',[3],true);
    assert.equal(deniedUnknown.status,400);
    const prior=executed;
    const deniedOversize=await post(partition.methodNames.compute,[999999],true);
    assert.equal(deniedOversize.status,403);
    assert.equal(executed,prior,'Unauthorized operation must have no protected side effects');
    const denialBodies=await Promise.all([
      deniedRpc.text(),deniedUnknown.text(),deniedOversize.text()
    ]);
    assert.ok(denialBodies.every(text=>!text.includes(canary)));

    /** @type {number[]} */
    const localTimes=[],remoteTimes=[],batchTimes=[];
    const inputs=Array.from({length:12},(_,i)=>i*41+7);
    const expected=await Promise.all(inputs.map(original));
    const observations=[];
    for(let round=0;round<5;round++) {
      let started=performance.now();
      const local=[];
      for(const value of inputs)local.push(await original(value));
      localTimes.push(performance.now()-started);
      assert.deepEqual(local,expected);
      started=performance.now();
      const fetched=[];
      for(const value of inputs) {
        const response=await post(partition.methodNames.compute,[value],true);
        assert.equal(response.status,200);
        const payload=await response.json();
        assert.equal(payload.ok,true);
        fetched.push(payload.value);
        observations.push(JSON.stringify(payload));
      }
      remoteTimes.push(performance.now()-started);
      assert.deepEqual(fetched,expected);
      started=performance.now();
      const batch=inputs.map(value=>({method:partition.methodNames.compute,args:[value]}));
      const response=await post(/** @type {string} */(partition.batchMethod),[batch],true);
      assert.equal(response.status,200);
      const payload=await response.json();
      assert.equal(payload.ok,true);
      const values=payload.value.map((/** @type {{ok:boolean,value:number}} */ item)=>{
        assert.equal(item.ok,true);
        return item.value;
      });
      observations.push(JSON.stringify(payload));
      batchTimes.push(performance.now()-started);
      assert.deepEqual(values,expected);
    }
    assert.ok(observations.every(text=>!text.includes(canary)),
      'Authenticated output has leaked private source canary');

    const local=median(localTimes),remote=median(remoteTimes),batch=median(batchTimes);
    const result={
      purpose:'SCO authenticated private implementation vs local execution',
      commit:process.env.GITHUB_SHA??'unavailable',
      runtime:{node:process.version,platform:process.platform},
      private_source_sha256:createHash('sha256').update(PRIVATE_SOURCE).digest('hex'),
      protected_source_bytes:Buffer.byteLength(PRIVATE_SOURCE),
      public_stub_bytes:Buffer.byteLength(publicText),
      initialization:{private_import_ms:importMs,partition_ms:partitionMs,listen_ms:listenMs},
      protected_method_wall_ms:protectedWorkMs,protected_execution_count:executed,
      policy_calls:policyCalls,authorization_callback_wall_ms:policyMs,
      attacker:{
        controlled_surface:'client script, HTTP requests and responses',
        trust_assumption:'cannot access original server filesystem or runtime',
        invalid_source_read_status:deniedSource.status,
        valid_source_read_status:allowedSource.status,
        invalid_rpc_status:deniedRpc.status,
        unknown_method_status:deniedUnknown.status,
        invalid_argument_status:deniedOversize.status,
        unauthorized_server_executions:executed-prior-120,
        private_literal_in_public_or_observed_responses:false,
        authorized_oracle_calls:120,
        black_box_algorithm_extraction:'not tested; unlimited authorized requests remain in threat model'
      },
      workload:{iterations_per_call:4096,calls_per_round:12,rounds:5,
        local_samples_ms:localTimes,serial_samples_ms:remoteTimes,batch_samples_ms:batchTimes},
      results:{local_median_ms:local,sequential_rpc_median_ms:remote,
        batch_rpc_median_ms:batch,serial_ratio:remote/local,batch_ratio:batch/local,
        serial_within_2_5x:remote/local<=2.5,batch_within_2_5x:batch/local<=2.5},
      caveats:'Same-process loopback, Node fetch, no remote RTT/TLS/database; method time includes Promise completion, policy callback excludes session verification I/O.'
    };
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }finally {
    if(server)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await fs.rm(directory,{recursive:true,force:true});
  }
}
main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
