'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {makeServer}=require('./sco-ratchet-batch-candidate');
const {createPrivateMachine}=require('./sco-ratchet-boundary');

/** @typedef {{status:number,value?:string[]}} Reply */

/** @param {string} label @param {number} index @returns {string} */
function challenge(label,index){
  return createHash('sha256').update(label+'/'+index).digest('hex');
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
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
 * @param {string} url
 * @param {string|undefined} token
 * @param {number} start
 * @param {string[]} inputs
 * @returns {Promise<Reply>}
 */
async function call(url,token,start,inputs){
  const response=await fetch(url,{
    method:'POST',
    headers:{'content-type':'application/json',...(token?{cookie:'session='+token}:{})},
    body:JSON.stringify({method:'batch',args:[start,inputs]})
  });
  const data=/** @type {{ok?:boolean,value?:string[]}} */(await response.json());
  return {status:response.status,value:data.value};
}

/**
 * An attacker-operated service accepts unauthenticated downstream RPCs and
 * attaches only its own legitimate Account A credential upstream. It never
 * reads the trusted server's root key or the target Account B credential.
 * This is a live same-account functional clone, not offline recovery.
 * @param {string} trustedUrl
 * @param {string} attackToken
 * @returns {http.RequestListener}
 */
function attackerProxy(trustedUrl,attackToken){
  return (request,response)=>{
    if(request.method!=='POST'||request.url!=='/rpc'){
      response.writeHead(404).end();return;
    }
    void (async()=>{
      /** @type {Buffer[]} */
      const chunks=[];
      let size=0;
      for await(const chunk of request){
        size+=chunk.length;
        if(size>65536){response.writeHead(413).end();return;}
        chunks.push(chunk);
      }
      const upstream=await fetch(trustedUrl,{
        method:'POST',
        headers:{'content-type':'application/json',cookie:'session='+attackToken},
        body:Buffer.concat(chunks)
      });
      const text=await upstream.text();
      response.writeHead(upstream.status,{
        'content-type':'application/json','cache-control':'no-store'
      });
      response.end(text);
    })().catch(()=>{
      if(!response.headersSent)response.writeHead(502).end();
      else response.destroy();
    });
  };
}

/** @returns {Promise<object>} */
async function experiment(){
  const root=randomBytes(32);
  const backend=makeServer(root,0);
  const tokenA=randomBytes(32).toString('hex');
  const tokenB=randomBytes(32).toString('hex');
  backend.grant(tokenA,'account-A');
  backend.grant(tokenB,'account-B');
  const trusted=await listen(backend.handler);
  const relay=await listen(attackerProxy(trusted.base+'/obfs/rpc',tokenA));
  try{
    const native=createPrivateMachine(root);
    const nativeB=createPrivateMachine(root);
    const publicResponse=await fetch(trusted.base+'/obfs/batch.mjs',{
      headers:{cookie:'session='+tokenA}
    });
    assert.equal(publicResponse.status,200);
    const source=await publicResponse.text();
    assert.doesNotMatch(source,/ratchet-step-v1|createHmac|createPrivateMachine/u);
    assert.equal((await fetch(trusted.base+'/obfs/batch.mjs')).status,403);
    const firstInput=[challenge('held-out',0)];
    assert.equal((await call(trusted.base+'/obfs/rpc',undefined,0,firstInput)).status,403);
    const firstProxy=await call(relay.base+'/rpc',undefined,0,firstInput);
    assert.equal(firstProxy.status,200);
    assert.deepEqual(firstProxy.value,[native.advance('account-A',0,firstInput[0])]);
    // The attacker consumed the legitimate A sequence. A second honest
    // client still holding the stale 0 position is now rejected.
    const honestStale=await call(trusted.base+'/obfs/rpc',tokenA,0,firstInput);
    assert.equal(honestStale.status,403);
    let sequence=1;
    let forwardedMatches=1,crossAccountMatches=0,bMatches=0;
    let batches=1;
    let targetSequence=0;
    for(let round=1;round<32;round++){
      const inputs=Array.from({length:1+round%4},(_,index)=>
        challenge('held-out',sequence+index));
      const output=await call(relay.base+'/rpc',undefined,sequence,inputs);
      assert.equal(output.status,200);
      const expected=inputs.map((value,index)=>
        native.advance('account-A',sequence+index,value));
      assert.deepEqual(output.value,expected);
      forwardedMatches++;
      batches++;
      const target=await call(trusted.base+'/obfs/rpc',tokenB,targetSequence,inputs);
      assert.equal(target.status,200);
      assert.deepEqual(target.value,inputs.map((value,index)=>
        nativeB.advance('account-B',targetSequence+index,value)));
      for(let i=0;i<inputs.length;i++){
        if(output.value?.[i]===target.value?.[i])crossAccountMatches++;
        bMatches++;
      }
      sequence+=inputs.length;
      targetSequence+=inputs.length;
    }
    assert.equal(forwardedMatches,32);
    assert.equal(crossAccountMatches,0);
    assert.equal(batches,32);
    assert.equal((await call(trusted.base+'/obfs/rpc',tokenA,0,firstInput)).status,403);

    // Sample native/direct/two-hop sessions over separate contiguous 16-event
    // stretches of the same account A stream. Three strategies preserve
    // policy and state; only transport overhead differs.
    /** @type {number[]} */
    const nativeTimes=[],directTimes=[],relayTimes=[];
    for(let trial=0;trial<7;trial++){
      for(const strategy of trial%2===0?
        /** @type {const} */(['native','direct','relay']):
        /** @type {const} */(['relay','direct','native'])){
        const inputs=Array.from({length:16},(_,index)=>
          challenge('performance',sequence+index));
        const started=performance.now();
        /** @type {string[]|undefined} */
        let observed;
        if(strategy==='native'){
          observed=inputs.map((value,index)=>{
            const output=native.advance('account-A',sequence+index,value);
            assert.equal(typeof output,'string');
            return /** @type {string} */(output);
          });
          nativeTimes.push(performance.now()-started);
          // Keep the actual server's state synchronized through the identical
          // direct authorized transition. That request is intentionally not
          // included in the in-process native timing.
          const sync=await call(trusted.base+'/obfs/rpc',tokenA,sequence,inputs);
          assert.equal(sync.status,200);
          assert.deepEqual(sync.value,observed);
        }else{
          const response=await call(strategy==='direct'?
            trusted.base+'/obfs/rpc':relay.base+'/rpc',
            strategy==='direct'?tokenA:undefined,sequence,inputs);
          assert.equal(response.status,200);
          observed=response.value;
          if(strategy==='direct')directTimes.push(performance.now()-started);
          else relayTimes.push(performance.now()-started);
          assert.deepEqual(observed,inputs.map((value,index)=>
            native.advance('account-A',sequence+index,value)));
        }
        sequence+=inputs.length;
      }
    }
    const nativeMedian=median(nativeTimes);
    const directMedian=median(directTimes);
    const relayMedian=median(relayTimes);
    const directRatios=directTimes.map((value,index)=>value/nativeTimes[index]);
    const relayRatios=relayTimes.map((value,index)=>value/nativeTimes[index]);
    return {
      platform:process.platform,node:process.version,
      deliveredPublicSha256:createHash('sha256').update(source).digest('hex'),
      deliveredBytes:Buffer.byteLength(source),
      privateWorkBytesPerEvent:8388608,
      attackerCredentialScope:'Account A only',
      anonymousDownstreamBatches:batches,
      onlineAForwardedMatches:forwardedMatches,
      heldoutBCrossAccountMatches:crossAccountMatches,
      targetBComparedEvents:bMatches,
      honestAStaleStatus:honestStale.status,
      unauthenticatedDirectStatus:403,
      nativeMedianMs:nativeMedian,directMedianMs:directMedian,relayMedianMs:relayMedian,
      directMedianRatio:directMedian/nativeMedian,
      relayMedianRatio:relayMedian/nativeMedian,
      strictMedianRelayWithin2_5x:relayMedian/nativeMedian<=2.5,
      directStrictOverBudgetPairs:directRatios.filter(value=>value>2.5).length,
      relayStrictOverBudgetPairs:relayRatios.filter(value=>value>2.5).length,
      maximumDirectRatio:Math.max(...directRatios),
      maximumRelayRatio:Math.max(...relayRatios),
      pairedDirectRatios:directRatios.map(value=>Number(value.toFixed(5))),
      pairedRelayRatios:relayRatios.map(value=>Number(value.toFixed(5))),
      trialsPerStrategy:7,
      caveat:'All attacker and trusted processes run on one local machine. Online same-account relay succeeds by design, no full-control server compromise or real RTT.'
    };
  }finally{
    /** @type {Promise<void>} */
    const relayClosed=new Promise((resolve,reject)=>
      relay.server.close(error=>error?reject(error):resolve()));
    await relayClosed;
    /** @type {Promise<void>} */
    const trustedClosed=new Promise((resolve,reject)=>
      trusted.server.close(error=>error?reject(error):resolve()));
    await trustedClosed;
  }
}

if(require.main===module){
  experiment().then(result=>process.stdout.write('SCO_RATCHET_ONLINE_RELAY '+JSON.stringify(result)+'\n'),
    error=>{process.stderr.write((error.stack||String(error))+'\n');process.exitCode=1;});
}
module.exports={experiment,attackerProxy};
