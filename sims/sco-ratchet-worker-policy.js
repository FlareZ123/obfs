'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const {createPrivateMachine}=require('./sco-ratchet-boundary');
const {makeWorkerServer}=require('./sco-ratchet-worker-http-contention');

/** @typedef {{status:number,ok?:boolean,value?:string[],error?:string}} RpcResult */

/** @param {string} label @returns {string} */
function challenge(label){
  return createHash('sha256').update('worker-policy/'+label).digest('hex');
}

/**
 * Test real selected SCO endpoint policy, stale/replay and same-principal
 * concurrency after worker-thread private machine isolation.
 * @returns {Promise<object>}
 */
async function experiment(){
  const key=randomBytes(32);
  const backend=makeWorkerServer(key,()=>null);
  const victim='verified-B',attacker='verified-A';
  const tokenB=randomBytes(32).toString('hex');
  const tokenA=randomBytes(32).toString('hex');
  const tokenUnverified=randomBytes(32).toString('hex');
  backend.grant(tokenB,victim);
  backend.grant(tokenA,attacker);
  await backend.ready();
  const native=createPrivateMachine(key);
  const server=http.createServer(backend.handler);
  /** @type {Promise<void>} */
  const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await ready;
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  const base='http://127.0.0.1:'+address.port;
  /**
   * @param {string|undefined} token
   * @param {unknown[]} args
   * @returns {Promise<RpcResult>}
   */
  async function call(token,args){
    const response=await fetch(base+'/obfs/rpc',{
      method:'POST',
      headers:{'content-type':'application/json',
        ...(token?{cookie:'session='+token}:{})},
      body:JSON.stringify({method:'batch',args})
    });
    const payload=/** @type {{ok?:boolean,value?:string[],error?:string}} */(await response.json());
    return {status:response.status,...payload};
  }
  try{
    const deniedSource=await fetch(base+'/obfs/batch.mjs');
    assert.equal(deniedSource.status,403);
    const admittedSource=await fetch(base+'/obfs/batch.mjs',{headers:{cookie:'session='+tokenB}});
    assert.equal(admittedSource.status,200);
    const source=await admittedSource.text();
    assert.doesNotMatch(source,/createPrivateMachine|workerData|ratchet-step-v1|createHmac/u);
    assert.doesNotMatch(source,new RegExp(key.toString('hex'),'u'));

    const input0=challenge('b0');
    const unauthorized=await call(undefined,[0,[input0]]);
    const alienToken=await call(tokenUnverified,[0,[input0]]);
    const badFuture=await call(tokenB,[1,[input0]]);
    const badMethodInputs=await call(tokenB,[0,[input0,'not-a-hash']]);
    assert.deepEqual([unauthorized.status,alienToken.status,badFuture.status,badMethodInputs.status],[403,403,403,403]);
    assert.equal(backend.calls(),0);
    const firstB=await call(tokenB,[0,[input0]]);
    assert.equal(firstB.status,200);
    assert.deepEqual(firstB.value,[native.advance(victim,0,input0)]);
    const replayB=await call(tokenB,[0,[input0]]);
    assert.equal(replayB.status,403);

    const input1=challenge('b1'),input2=challenge('b2');
    const concurrent=await Promise.all([
      call(tokenB,[1,[input1,input2]]),
      call(tokenB,[1,[input1,input2]])
    ]);
    assert.deepEqual(concurrent.map(row=>row.status).sort((a,b)=>a-b),[200,403]);
    assert.deepEqual(concurrent.find(row=>row.status===200)?.value,[
      native.advance(victim,1,input1),
      native.advance(victim,2,input2)
    ]);
    assert.equal((await call(tokenB,[1,[input1,input2]])).status,403);

    const inputA=challenge('a0');
    const distinctA=await call(tokenA,[0,[inputA]]);
    assert.equal(distinctA.status,200);
    assert.deepEqual(distinctA.value,[native.advance(attacker,0,inputA)]);
    assert.notDeepEqual(distinctA.value,firstB.value);
    assert.equal(backend.calls(),4);
    return {
      node:process.version,platform:process.platform,
      generatedSourceVisibleButPrivateMachineAbsent:true,
      anonymousStatus:unauthorized.status,unknownBearerStatus:alienToken.status,
      futureSequenceStatus:badFuture.status,malformedInputStatus:badMethodInputs.status,
      staleReplayStatus:replayB.status,concurrentStatuses:[200,403],
      survivingIndependentPrincipal:true,
      executedPrivateEvents:backend.calls(),correctNativeOutputs:true
    };
  }finally{
    server.closeAllConnections();
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await closed;
    await backend.shutdown();
  }
}

if(require.main===module){
  experiment().then(result=>process.stdout.write('SCO_WORKER_POLICY '+JSON.stringify(result)+'\n'),
    error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
}
module.exports={experiment};
