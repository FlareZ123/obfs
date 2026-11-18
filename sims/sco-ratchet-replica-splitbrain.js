'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const {makeServer}=require('./sco-ratchet-batch-candidate');
const {makeIdempotentServer}=require('./sco-ratchet-retry-candidate');
const {createPrivateMachine}=require('./sco-ratchet-boundary');

/** @typedef {{status:number,value?:string[]}} Reply */

/** @param {string} label @param {number} index @returns {string} */
function challenge(label,index){
  return createHash('sha256').update(label+'/'+index).digest('hex');
}

/**
 * @param {http.RequestListener} handler
 * @returns {Promise<{server:http.Server,base:string}>}
 */
async function listen(handler){
  const server=http.createServer(handler);
  /** @type {Promise<void>} */
  const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await ready;
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  return {server,base:'http://127.0.0.1:'+address.port};
}

/**
 * @param {string} base
 * @param {string|undefined} token
 * @param {number} start
 * @param {string[]} inputs
 * @returns {Promise<Reply>}
 */
async function call(base,token,start,inputs){
  const response=await fetch(base+'/obfs/rpc',{
    method:'POST',
    headers:{'content-type':'application/json',...(token?{cookie:'session='+token}:{})},
    body:JSON.stringify({method:'batch',args:[start,inputs]})
  });
  const body=/** @type {{value?:string[]}} */(await response.json());
  return {status:response.status,value:body.value};
}

/** @param {http.Server} server @returns {Promise<void>} */
function close(server){
  return new Promise((resolve,reject)=>
    server.close(error=>error?reject(error):resolve()));
}

/**
 * @param {ReturnType<typeof createPrivateMachine>} machine
 * @param {string} principal
 * @param {number} start
 * @param {string[]} inputs
 * @returns {string[]}
 */
function expected(machine,principal,start,inputs){
  return inputs.map((value,index)=>{
    const output=machine.advance(principal,start+index,value);
    assert.equal(typeof output,'string');
    return /** @type {string} */(output);
  });
}

/**
 * Each replica is a separate trusted SCO handler with the same private root,
 * verified principal and bearer cookie. The only difference is process-local
 * ratchet state and last-result cache. The experiment checks real HTTP
 * policy decisions, private work counters, source publication and outputs.
 *
 * @returns {Promise<object>}
 */
async function experiment(){
  const root=randomBytes(32);
  const token=randomBytes(32).toString('hex');
  const principal='verified-account-A';
  const first=[challenge('first',0),challenge('first',1)];
  const next=[challenge('next',2),challenge('next',3)];
  const other=[challenge('fork',2),challenge('fork',3)];
  const native=createPrivateMachine(root);
  const firstExpected=expected(native,principal,0,first);
  const nextExpected=expected(native,principal,2,next);
  const divergentNative=createPrivateMachine(root);
  expected(divergentNative,principal,0,first);
  const forkExpected=expected(divergentNative,principal,2,other);
  assert.notDeepEqual(forkExpected,nextExpected);

  const single=makeServer(root,0);
  const left=makeServer(root,0);
  const right=makeServer(root,0);
  const restarted=makeServer(root,0);
  const singleRetry=makeIdempotentServer(root,0);
  const leftRetry=makeIdempotentServer(root,0);
  const rightRetry=makeIdempotentServer(root,0);
  const handlers=[single,left,right,restarted,singleRetry,leftRetry,rightRetry];
  for(const handler of handlers)handler.grant(token,principal);

  const addresses=await Promise.all(handlers.map(handler=>listen(handler.handler)));
  const [one,l,r,restart,oneRetry,lRetry,rRetry]=addresses.map(a=>a.base);
  try{
    const sourceUnauthorized=await fetch(l+'/obfs/batch.mjs');
    const sourceAuthorized=await fetch(l+'/obfs/batch.mjs',{
      headers:{cookie:'session='+token}
    });
    assert.equal(sourceUnauthorized.status,403);
    assert.equal(sourceAuthorized.status,200);
    const source=await sourceAuthorized.text();
    assert.doesNotMatch(source,/ratchet-step-v1|createHmac|createPrivateMachine/u);
    assert.doesNotMatch(source,new RegExp(root.toString('hex'),'u'));
    const sourceSha256=createHash('sha256').update(source).digest('hex');
    const noToken=await call(r,undefined,0,first);
    assert.equal(noToken.status,403);

    // Control: a single handler serializes an entire account's policy state.
    const singleFirst=await call(one,token,0,first);
    const singleNext=await call(one,token,2,next);
    const singleStale=await call(one,token,0,first);
    assert.equal(singleFirst.status,200);
    assert.equal(singleNext.status,200);
    assert.equal(singleStale.status,403);
    assert.deepEqual(singleFirst.value,firstExpected);
    assert.deepEqual(singleNext.value,nextExpected);
    assert.equal(single.calls(),4);

    // Split-brain: replica-local state cannot enforce a global sequence.
    const leftFirst=await call(l,token,0,first);
    const wrongNextRight=await call(r,token,2,next);
    const repeatedOnRight=await call(r,token,0,first);
    const staleLeft=await call(l,token,0,first);
    assert.deepEqual([leftFirst.status,wrongNextRight.status,
      repeatedOnRight.status,staleLeft.status],[200,403,200,403]);
    assert.deepEqual(leftFirst.value,firstExpected);
    assert.deepEqual(repeatedOnRight.value,firstExpected);
    assert.equal(left.calls(),2);
    assert.equal(right.calls(),2);
    const leftNext=await call(l,token,2,next);
    const rightDifferentNext=await call(r,token,2,other);
    assert.deepEqual([leftNext.status,rightDifferentNext.status],[200,200]);
    assert.deepEqual(leftNext.value,nextExpected);
    assert.deepEqual(rightDifferentNext.value,forkExpected);
    assert.equal(left.calls(),4);
    assert.equal(right.calls(),4);

    // Reconstructing a trusted handler after its predecessor exits is a
    // controlled process-restart equivalent; it does not test a real crash.
    const afterRestart=await call(restart,token,0,first);
    assert.equal(afterRestart.status,200);
    assert.deepEqual(afterRestart.value,firstExpected);
    assert.equal(restarted.calls(),2);

    // Control: one in-process last-batch cache avoids duplicate work.
    const cachedFirst=await call(oneRetry,token,0,first);
    const cachedDuplicate=await call(oneRetry,token,0,first);
    assert.deepEqual([cachedFirst.status,cachedDuplicate.status],[200,200]);
    assert.deepEqual(cachedFirst.value,firstExpected);
    assert.deepEqual(cachedDuplicate.value,firstExpected);
    assert.equal(singleRetry.calls(),2);
    assert.equal(singleRetry.hits(),1);
    const cachedNext=await call(oneRetry,token,2,next);
    const cachedOld=await call(oneRetry,token,0,first);
    assert.deepEqual([cachedNext.status,cachedOld.status],[200,403]);
    assert.deepEqual(cachedNext.value,nextExpected);
    assert.equal(singleRetry.calls(),4);

    // Two separate idempotent caches both consider the same request fresh.
    const firstRetryLeft=await call(lRetry,token,0,first);
    const duplicateRetryRight=await call(rRetry,token,0,first);
    const locallyCached=await call(lRetry,token,0,first);
    assert.deepEqual([firstRetryLeft.status,duplicateRetryRight.status,
      locallyCached.status],[200,200,200]);
    assert.deepEqual(firstRetryLeft.value,firstExpected);
    assert.deepEqual(duplicateRetryRight.value,firstExpected);
    assert.deepEqual(locallyCached.value,firstExpected);
    assert.equal(leftRetry.calls(),2);
    assert.equal(rightRetry.calls(),2);
    assert.equal(leftRetry.hits(),1);
    assert.equal(rightRetry.hits(),0);

    const report={
      node:process.version,platform:process.platform,
      publicSourceSha256:sourceSha256,publicSourceBytes:Buffer.byteLength(source),
      rootBits:256,privateWorkBytesPerEvent:8*1024*1024,
      principalCount:1,originalParity:true,
      verifiedSourceRead:200,anonymousSourceRead:403,anonymousRpc:403,
      strictSingle:{statuses:[singleFirst.status,singleNext.status,singleStale.status],
        privateEvents:single.calls()},
      strictReplicas:{statuses:[leftFirst.status,wrongNextRight.status,
        repeatedOnRight.status,staleLeft.status,leftNext.status,rightDifferentNext.status],
        replicaEvents:[left.calls(),right.calls()],
        repeatedOutputMatches:true,divergedAfterDifferentInput:true},
      restartEquivalent:{staleRequestStatus:afterRestart.status,
        replayedProtectedEvents:restarted.calls()},
      idempotentSingle:{statuses:[cachedFirst.status,cachedDuplicate.status,
        cachedNext.status,cachedOld.status],
        privateEvents:singleRetry.calls(),cacheHits:singleRetry.hits()},
      idempotentReplicas:{statuses:[firstRetryLeft.status,duplicateRetryRight.status,
        locallyCached.status],replicaEvents:[leftRetry.calls(),rightRetry.calls()],
        cacheHits:[leftRetry.hits(),rightRetry.hits()],
        duplicateCrossReplicaProtectedEvents:2},
      boundary:'In-memory process-local admission state under two trusted replicas; no actual crash, distributed database, TLS, malicious B credential, or end-to-end CPU budget claim.'
    };
    process.stdout.write('SCO_RATCHET_REPLICA_SPLITBRAIN '+JSON.stringify(report)+'\n');
    return report;
  }finally{
    await Promise.all(addresses.map(address=>close(address.server)));
  }
}

if(require.main===module){
  experiment().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={experiment};
