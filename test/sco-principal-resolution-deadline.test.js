'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoKeyedIsolation,ScoIsolationBusyError}=
  require('../src/rpc-keyed-isolation');
const {createScoHandler}=require('../src/sco');

/** @returns {{promise:Promise<void>,resolve:()=>void}} */
function gate(){
  /** @type {()=>void} */
  let resolve=()=>{};
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}

/** @returns {import('node:http').IncomingMessage} */
function requestFor(){
  return /** @type {import('node:http').IncomingMessage} */ (/** @type {unknown} */ ({}));
}

test('SCO principal lookup deadline has a valid Node timer range',()=>{
  const principalOf=()=> 'verified';
  for(const invalid of [0,-1,0.5,NaN,2147483648,Number.MAX_SAFE_INTEGER]){
    assert.throws(()=>createScoKeyedIsolation(principalOf,{
      maxPrincipalResolutionMs:invalid
    }),/maxPrincipalResolutionMs/);
  }
  assert.doesNotThrow(()=>createScoKeyedIsolation(principalOf,{
    maxPrincipalResolutionMs:2147483647
  }));
});

test('SCO deadline releases reservation and never runs a late principal result',{
  timeout:10000
},async()=>{
  const stalled=gate();
  let lookedUp=0;
  let effects=0;
  const isolate=createScoKeyedIsolation(async()=>{
    lookedUp++;
    if(lookedUp===1)await stalled.promise;
    return 'verified';
  },{maxPendingTotal:1,maxPrincipalResolutionMs:35});
  const first=isolate(requestFor(),async()=>{effects++;});
  try{
    await assert.rejects(first,ScoIsolationBusyError);
    await isolate(requestFor(),async()=>{effects++;});
    assert.equal(lookedUp,2);
    assert.equal(effects,1);
    stalled.resolve();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(effects,1,'Late authentication result must not run an expired RPC');
  }finally{
    stalled.resolve();
    await Promise.allSettled([first]);
  }
});

test('SCO cached asynchronous principals settle without deadline expiration',async()=>{
  let effects=0;
  const verified=createScoKeyedIsolation(async()=> 'cached',{
    maxPendingTotal:1,maxPrincipalResolutionMs:1
  });
  await verified(requestFor(),async()=>{effects++;});
  assert.equal(effects,1);
  const rejected=createScoKeyedIsolation(()=>Promise.reject(
    Error('identity-provider-rejection')),{maxPendingTotal:1,maxPrincipalResolutionMs:1});
  await assert.rejects(rejected(requestFor(),async()=>{effects++;}),
    /identity-provider-rejection/);
  assert.equal(effects,1);
  // Late failure after a timed-out lookup must have an attached rejection
  // handler and must not execute an operation or strand global capacity.
  const delayed=gate();
  const expired=createScoKeyedIsolation(async()=>{
    await delayed.promise;
    throw Error('late-identity-provider-rejection');
  },{maxPendingTotal:1,maxPrincipalResolutionMs:10});
  await assert.rejects(expired(requestFor(),async()=>{effects++;}),
    ScoIsolationBusyError);
  delayed.resolve();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(effects,1);
});

test('SCO deadline covers principal resolution only, not protected execution',{
  timeout:10000
},async()=>{
  const entered=gate();
  const release=gate();
  const isolate=createScoKeyedIsolation(()=> 'verified',{
    maxPendingTotal:1,maxPrincipalResolutionMs:15
  });
  let effects=0;
  const running=isolate(requestFor(),async()=>{
    entered.resolve();
    await release.promise;
    effects++;
  });
  try{
    await entered.promise;
    await new Promise(resolve=>setTimeout(resolve,40));
    release.resolve();
    await running;
    assert.equal(effects,1);
    await isolate(requestFor(),async()=>{effects++;});
    assert.equal(effects,2);
  }finally{
    release.resolve();
    await Promise.allSettled([running]);
  }
});

test('SCO HTTP deadline rejects stalled lookup with 429 and accepts next call',{
  timeout:15000
},async()=>{
  const stalled=gate();
  const entered=gate();
  let lookups=0;
  let effects=0;
  const isolation=createScoKeyedIsolation(async()=>{
    lookups++;
    if(lookups===1){
      entered.resolve();
      await stalled.promise;
    }
    return 'verified';
  },{maxPendingTotal:1,maxPrincipalResolutionMs:75});
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{read:()=>{effects++;return 29;}},
    authorizeRpc:()=>true,
    runRpcIsolated:isolation
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected HTTP listener');
    const endpoint='http://127.0.0.1:'+address.port+'/obfs/rpc';
    const init={method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:'read',args:[]}),
      signal:AbortSignal.timeout(5000)};
    const first=fetch(endpoint,init);
    await entered.promise;
    const denied=await first;
    assert.equal(denied.status,429);
    assert.deepEqual(await denied.json(),{ok:false,error:'Too many requests'});
    assert.equal(effects,0);
    const next=await fetch(endpoint,init);
    assert.equal(next.status,200);
    assert.deepEqual(await next.json(),{ok:true,value:29});
    stalled.resolve();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(effects,1,'Late lookup cannot execute stale protected work');
  }finally{
    stalled.resolve();
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
