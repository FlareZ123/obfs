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
  assert.throws(()=>createScoKeyedIsolation(principalOf,{
    abortPrincipalLookup:true
  }),/abortPrincipalLookup/);
  assert.throws(()=>createScoKeyedIsolation(principalOf,{
    maxPrincipalResolutionMs:10,abortPrincipalLookup:'yes'
  }),/abortPrincipalLookup/);

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

test('SCO aborts a cooperating identity provider on lookup deadline',async()=>{
  /** @type {AbortSignal|undefined} */
  let exposedSignal;
  let externalReservations=0;
  let privateEffects=0;
  const isolate=createScoKeyedIsolation((_request,signal)=>{
    exposedSignal=signal;
    externalReservations++;
    return new Promise((_resolve,reject)=>{
      signal?.addEventListener('abort',()=>{
        externalReservations--;
        reject(Error('identity-fetch-aborted'));
      },{once:true});
    });
  },{maxPendingTotal:1,maxPrincipalResolutionMs:20,abortPrincipalLookup:true});
  await assert.rejects(isolate(requestFor(),async()=>{privateEffects++;}),
    ScoIsolationBusyError);
  assert.equal(exposedSignal?.aborted,true);
  assert.equal(externalReservations,0,'Cooperating resolver freed external reservation');
  assert.equal(privateEffects,0,'Aborted resolver cannot enter protected method');
});

test('SCO deadline can abort real upstream identity HTTP fetch',{
  timeout:15000
},async()=>{
  const started=gate();
  const closed=gate();
  let requests=0;
  let privateEffects=0;
  const upstream=http.createServer((_request,response)=>{
    requests++;
    if(requests===1){
      started.resolve();
      response.on('close',()=>closed.resolve());
      return; // Simulated identity provider that never sends its headers.
    }
    response.end('verified');
  });
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  try{
    const address=upstream.address();
    if(!address||typeof address==='string')throw Error('Expected identity provider');
    const endpoint='http://127.0.0.1:'+address.port+'/identity';
    const isolate=createScoKeyedIsolation(async(_request,signal)=>{
      const reply=await fetch(endpoint,{signal});
      return reply.text();
    },{maxPendingTotal:1,maxPrincipalResolutionMs:250,abortPrincipalLookup:true});
    const first=isolate(requestFor(),async()=>{privateEffects++;});
    await started.promise;
    await assert.rejects(first,ScoIsolationBusyError);
    await closed.promise;
    await isolate(requestFor(),async()=>{privateEffects++;});
    assert.equal(requests,2);
    assert.equal(privateEffects,1,'Timed-out identity fetch never enters private code');
  }finally{
    upstream.closeAllConnections();
    await new Promise((resolve,reject)=>upstream.close(error=>error?reject(error):resolve()));
  }
});

test('SCO abort flag never cancels a successfully resolved async session',async()=>{
  /** @type {AbortSignal|undefined} */
  let signal;
  let effects=0;
  const isolate=createScoKeyedIsolation((_request,provided)=>{
    signal=provided;
    return Promise.resolve('verified');
  },{maxPendingTotal:1,maxPrincipalResolutionMs:1,abortPrincipalLookup:true});
  await isolate(requestFor(),async()=>{effects++;});
  assert.equal(effects,1);
  assert.equal(signal?.aborted,false);
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

test('SCO lookup deadline rejects microtask resolution after timers were starved',async()=>{
  const blocked=new Int32Array(new SharedArrayBuffer(4));
  let lookups=0;
  let privateEffects=0;
  /** @type {AbortSignal|undefined} */
  let lookupSignal;
  const isolate=createScoKeyedIsolation((_request,signal)=>{
    lookupSignal=signal;
    lookups++;
    if(lookups===1){
      return new Promise(resolve=>{
        queueMicrotask(()=>{
          // This blocks the timer phase while the identity promise settles.
          // A deadline enforced solely by setTimeout can incorrectly accept it.
          Atomics.wait(blocked,0,0,35);
          resolve('verified');
        });
      });
    }
    return Promise.resolve('verified');
  },{maxPendingTotal:1,maxPrincipalResolutionMs:5,abortPrincipalLookup:true});
  await assert.rejects(
    isolate(requestFor(),async()=>{privateEffects++;}),
    ScoIsolationBusyError);
  assert.equal(privateEffects,0,'Expired lookup must never enter private work');
  assert.equal(lookupSignal?.aborted,true,'Expired lookup must abort its signal');
  await isolate(requestFor(),async()=>{privateEffects++;});
  assert.equal(privateEffects,1,'Timeout frees its global reservation');
});

test('SCO lookup deadline checks a blocking synchronous principal resolver',async()=>{
  const blocked=new Int32Array(new SharedArrayBuffer(4));
  let privateEffects=0;
  const isolate=createScoKeyedIsolation(()=>{
    Atomics.wait(blocked,0,0,35);
    return 'verified';
  },{maxPendingTotal:1,maxPrincipalResolutionMs:5});
  await assert.rejects(
    isolate(requestFor(),async()=>{privateEffects++;}),
    ScoIsolationBusyError);
  assert.equal(privateEffects,0,'Over-deadline lookup may not launch protected work');
});
