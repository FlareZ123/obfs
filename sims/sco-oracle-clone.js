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
 * A deliberately tiny finite, approved operation domain is chosen to make
 * exhaustive legitimate queries feasible. The result is a functional cloning
 * attack, not a recovery of the hidden source or key.
 */
const SOURCE=[
  'const privateServerKey="PRIVATE_SCO_ORACLE_KEY_a98c3dcdccf1";',
  'const hiddenSalt=[79,23,147,208,61,16,191,44];',
  'export async function classify(value){',
  ' const offset=privateServerKey.charCodeAt(5);',
  ' let v=(value^hiddenSalt[value&7]^offset)&255;',
  ' for(let i=0;i<5;i++)v=(Math.imul(v+hiddenSalt[(i+value)&7],73)+i*19)&255;',
  ' return v;',
  '}'
].join('\n');

/** @returns {Promise<void>} */
async function main() {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-oracle-clone-'));
  /** @type {http.Server|null} */
  let server=null;
  try {
    const privateFile=path.join(dir,'source-private.mjs');
    await atomicWrite(privateFile,SOURCE);
    const module=await import(pathToFileURL(privateFile).href);
    const original=/** @type {(value:number)=>Promise<number>} */ (module.classify);
    const partition=partitionScoAsyncModule({
      path:'public.mjs',sourceType:'module',code:SOURCE
    },{seed:'sco-oracle-clone-fixed-seed',serverOnlyInitialization:true,batch:true,maxBatchCalls:16});
    assert.equal(partition.names.length,1);
    let legitimateExecutions=0,deniedExecutions=0;
    const methods=bindScoModuleExports(partition,{
      classify:async(/** @type {number} */ value)=>{
        legitimateExecutions++;
        return original(value);
      }
    });
    const authorized=/** @param {http.IncomingMessage} request @returns {boolean} */ request=>
      request.headers['x-session']==='approved';
    const authorizeOperation=/** @param {http.IncomingMessage} request @param {string} method @param {unknown[]} args @returns {boolean} */
    (request,method,args)=>{
      if(!authorized(request))return false;
      if(method===partition.batchMethod) {
        return args.length===1 && Array.isArray(args[0]) &&
          args[0].length>=1 && args[0].length<=16;
      }
      return method===partition.methodNames.classify && args.length===1 &&
        Number.isSafeInteger(args[0]) && /** @type {number} */(args[0])>=0 &&
        /** @type {number} */(args[0])<=255;
    };
    server=http.createServer(createScoHandler([partition.clientFile],{
      remoteMethods:methods,authorizeRead:authorized,authorizeRpc:authorized,
      authorizeOperation
    }));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected TCP listener');
    const origin='http://127.0.0.1:'+address.port+'/obfs/';
    const stubResponse=await fetch(origin+'public.mjs',{headers:{'x-session':'approved'}});
    assert.equal(stubResponse.status,200);
    const publicCode=await stubResponse.text();
    assert.ok(!publicCode.includes('PRIVATE_SCO_ORACLE_KEY_a98c3dcdccf1'));
    assert.ok(!publicCode.includes('hiddenSalt'));
    assert.ok(!publicCode.includes('Math.imul'));

    /** @param {string} method @param {unknown[]} args @param {boolean} valid */
    async function rpc(method,args,valid) {
      return fetch(origin+'rpc',{
        method:'POST',
        headers:{'content-type':'application/json',...(valid?{'x-session':'approved'}:{})},
        body:JSON.stringify({method,args})
      });
    }
    const unknown=await rpc('not-the-server-id',[0],true);
    assert.equal(unknown.status,400);
    const deniedSession=await rpc(partition.methodNames.classify,[0],false);
    assert.equal(deniedSession.status,403);
    const deniedRange=await rpc(partition.methodNames.classify,[256],true);
    assert.equal(deniedRange.status,403);
    deniedExecutions=legitimateExecutions;
    assert.equal(deniedExecutions,0);

    // Source-only analysis finds the method labels in the delivered facade.
    // The attacker is otherwise limited to authorized HTTP requests and
    // their responses. Batch sixteen legal inputs per oracle request.
    /** @type {number[]} */
    const table=new Array(256);
    let requests=0,queries=0,bytesSent=0,bytesReceived=0;
    const start=performance.now();
    for(let startValue=0;startValue<256;startValue+=16) {
      const calls=Array.from({length:16},(_,index)=>({
        method:partition.methodNames.classify,args:[startValue+index]
      }));
      const requestText=JSON.stringify({method:partition.batchMethod,args:[calls]});
      const reply=await rpc(/** @type {string} */ (partition.batchMethod),[calls],true);
      assert.equal(reply.status,200);
      const receivedText=await reply.text();
      const payload=JSON.parse(receivedText);
      assert.equal(payload.ok,true);
      assert.equal(payload.value.length,16);
      for(let i=0;i<16;i++) {
        assert.equal(payload.value[i].ok,true);
        const result=payload.value[i].value;
        assert.ok(Number.isSafeInteger(result) && result>=0 && result<=255);
        table[startValue+i]=result;
        queries++;
      }
      requests++;
      bytesSent+=Buffer.byteLength(requestText);
      bytesReceived+=Buffer.byteLength(receivedText);
    }
    const attackElapsed=performance.now()-start;
    assert.equal(legitimateExecutions,256);
    assert.equal(queries,256);
    assert.equal(requests,16);

    // Validate the fully independent client-side lookup replacement on the
    // finite authorized input space. It has no access to the secret source,
    // original module or runtime after its table has been recovered.
    const attackSource='const lookup='+JSON.stringify(table)+';module.exports=function classify(value){'+
      'if(!Number.isSafeInteger(value)||value<0||value>255)throw Error("Input out of scope");'+
      'return lookup[value];};';
    /** @type {{exports:unknown}} */
    const cloneModule={exports:null};
    const clone=new Function('module',attackSource)(cloneModule);
    void clone;
    const recovered=/** @type {(value:number)=>number} */ (cloneModule.exports);
    for(let value=0;value<256;value++){
      assert.equal(recovered(value),await original(value),'Black-box clone mismatch at '+value);
    }
    const protectedSourceHash=createHash('sha256').update(SOURCE).digest('hex');
    const output={
      purpose:'Bounded exact behavioral clone of authenticated SCO operation by legitimate oracle calls',
      commit:process.env.GITHUB_SHA??'unknown',
      platform:process.platform,node:process.version,
      private_source_sha256:protectedSourceHash,
      source_withheld:!publicCode.includes('PRIVATE_SCO_ORACLE_KEY_a98c3dcdccf1'),
      private_source_bytes:Buffer.byteLength(SOURCE),
      public_stub_bytes:Buffer.byteLength(publicCode),
      permitted_domain_size:256,
      queried_domain_size:queries,
      authorized_requests:requests,
      authorized_primitive_operations:legitimateExecutions,
      denied_attempts:{unknown_method:unknown.status,session:deniedSession.status,
        input_out_of_range:deniedRange.status,protected_executions_before_attack:deniedExecutions},
      attack:{
        goal:'recover a full functionally equivalent map for all permitted inputs without protected source or key',
        result:'complete finite-domain lookup reconstruction',
        exact_inputs_replayed:256,
        exact_matches:256,
        independent_lookup_source_bytes:Buffer.byteLength(attackSource),
        table_sha256:createHash('sha256').update(JSON.stringify(table)).digest('hex'),
        legitimate_oracle_elapsed_ms:attackElapsed,
        request_payload_bytes:bytesSent,response_payload_bytes:bytesReceived
      },
      limitations:'Finite 8-bit operation input, the entire authorized domain was enumerated; no unqueried-domain generalization, private-key extraction or source recovery. Same-process loopback with deliberately permissive deterministic session fixture; no TLS/rate limiting.'
    };
    process.stdout.write(JSON.stringify(output,null,2)+'\n');
  }finally {
    if(server)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await fs.rm(dir,{recursive:true,force:true});
  }
}
main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
