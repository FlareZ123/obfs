'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoKeyedIsolation,ScoIsolationBusyError}=require('../src/rpc-keyed-isolation');
const {createScoHandler}=require('../src/sco');

/** @returns {{promise:Promise<void>,resolve:()=>void}} */
function gate(){
  /** @type {()=>void} */
  let resolve=()=>{};
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}

/** @param {string} principal @returns {import('node:http').IncomingMessage} */
function requestFor(principal){
  return /** @type {import('node:http').IncomingMessage} */ (
    /** @type {unknown} */ ({principal}));
}

/** @param {import('node:http').IncomingMessage} request @returns {string} */
function principalOf(request){
  return /** @type {{principal:string}} */ (/** @type {unknown} */ (request)).principal;
}

test('SCO optional queue cap validates input and counts active plus waiting',async()=>{
  for(const invalid of [0,-1,1.5,Number.NaN,Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>createScoKeyedIsolation(principalOf,{
      maxPendingPerPrincipal:invalid}),/maxPendingPerPrincipal/);
    assert.throws(()=>createScoKeyedIsolation(principalOf,{
      maxPendingTotal:invalid}),/maxPendingTotal/);
  }
  const isolate=createScoKeyedIsolation(principalOf,{maxPendingPerPrincipal:2});
  const firstStarted=gate();
  const release=gate();
  /** @type {string[]} */
  const events=[];
  const first=isolate(requestFor('p'),async()=>{
    events.push('first-start');
    firstStarted.resolve();
    await release.promise;
    events.push('first-end');
  });
  await firstStarted.promise;
  const second=isolate(requestFor('p'),async()=>{events.push('second');});
  // The resolver is synchronous, so this turn lets the second call reserve
  // its place in the keyed queue before the third admission attempt.
  await Promise.resolve();
  await assert.rejects(isolate(requestFor('p'),async()=>{
    events.push('rejected');
  }),ScoIsolationBusyError);
  await isolate(requestFor('another-principal'),async()=>{
    events.push('independent');
  });
  assert.deepEqual(events,['first-start','independent']);
  release.resolve();
  await Promise.all([first,second]);
  assert.deepEqual(events,['first-start','independent','first-end','second']);
  await isolate(requestFor('p'),async()=>{events.push('after-release');});
  assert.equal(events.at(-1),'after-release');
});

test('SCO global queue cap bounds all principals and releases after errors',{
  timeout:10000
},async()=>{
  const isolate=createScoKeyedIsolation(principalOf,{
    maxPendingPerPrincipal:3,maxPendingTotal:2
  });
  const startedA=gate();
  const startedB=gate();
  const releaseA=gate();
  const releaseB=gate();
  /** @type {string[]} */
  const events=[];
  const a=isolate(requestFor('A'),async()=>{
    startedA.resolve();
    events.push('A-start');
    await releaseA.promise;
    events.push('A-end');
  });
  const b=isolate(requestFor('B'),async()=>{
    startedB.resolve();
    events.push('B-start');
    await releaseB.promise;
    events.push('B-end');
  });
  try{
    await Promise.all([startedA.promise,startedB.promise]);
    await assert.rejects(isolate(requestFor('C'),async()=>{
      events.push('should-not-execute');
    }),ScoIsolationBusyError,'Aggregate cap applies across distinct principals');
    releaseA.resolve();
    await a;
    await isolate(requestFor('C'),async()=>{events.push('C-start');});
    assert.equal(events.includes('C-start'),true);
    await assert.rejects(isolate(requestFor('D'),async()=>{
      throw Error('private-method-error');
    }),/private-method-error/);
    await isolate(requestFor('D'),async()=>{events.push('D-retried');});
    assert.equal(events.includes('D-retried'),true);
  }finally{
    releaseA.resolve();
    releaseB.resolve();
    await Promise.allSettled([a,b]);
  }
  assert.equal(events.includes('should-not-execute'),false);
});

test('SCO queue cap returns HTTP 429 without protected work and recovers',{
  timeout:15000
},async()=>{
  const started=gate();
  const release=gate();
  let effects=0;
  const isolation=createScoKeyedIsolation(request=>{
    // A production principal resolver must verify the session server-side.
    return request.headers['x-test-session']==='allow'?'verified':'unverified';
  },{maxPendingPerPrincipal:1});
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{
      hold:async()=>{started.resolve();await release.promise;effects++;return 'held';},
      fast:()=>{effects++;return 'fast';},
      fakeBusy:()=>{throw new ScoIsolationBusyError();}
    },
    authorizeRpc:request=>request.headers['x-test-session']==='allow',
    runRpcIsolated:isolation
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected bound server');
    const port=address.port;
    /** @param {string} method @returns {Promise<{status:number,body:any}>} */
    async function rpc(method){
      const response=await fetch('http://127.0.0.1:'+port+'/obfs/rpc',{
        method:'POST',
        headers:{'content-type':'application/json','x-test-session':'allow'},
        body:JSON.stringify({method,args:[]})
      });
      return {status:response.status,body:await response.json()};
    }
    const first=rpc('hold');
    await started.promise;
    assert.deepEqual(await rpc('fast'),{
      status:429,body:{ok:false,error:'Too many requests'}
    });
    assert.equal(effects,0,'Capacity refusal must not execute private methods');
    release.resolve();
    assert.deepEqual(await first,{status:200,body:{ok:true,value:'held'}});
    assert.deepEqual(await rpc('fast'),{status:200,body:{ok:true,value:'fast'}});
    assert.deepEqual(await rpc('fakeBusy'),{
      status:500,body:{ok:false,error:'Operation failed'}
    },'A private-method error must never be reclassified as a capacity rejection');
    assert.equal(effects,2);
  }finally{
    release.resolve();
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});


test('SCO aggregate cap denies authenticated third-account HTTP work',{
  timeout:15000
},async()=>{
  const bothEntered=gate();
  const release=gate();
  const accounts=new Map([['a','A'],['b','B'],['c','C']]);
  let started=0;
  /** @type {string[]} */
  const completed=[];
  const isolate=createScoKeyedIsolation(request=>{
    const credential=request.headers['x-test-session'];
    return typeof credential==='string'?accounts.get(credential)??'invalid':'invalid';
  },{maxPendingPerPrincipal:1,maxPendingTotal:2});
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{
      hold:async()=>{
        started++;
        if(started===2)bothEntered.resolve();
        await release.promise;
        completed.push('hold');
        return 'held';
      },
      quick:()=>{completed.push('quick');return 'quick';}
    },
    authorizeRpc:request=>accounts.has(String(request.headers['x-test-session'])),
    runRpcIsolated:isolate
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected bound server');
    const endpoint='http://127.0.0.1:'+address.port+'/obfs/rpc';
    /** @param {string} account @param {string} method @returns {Promise<{status:number,body:any}>} */
    async function rpc(account,method){
      const response=await fetch(endpoint,{
        method:'POST',
        headers:{'content-type':'application/json','x-test-session':account},
        body:JSON.stringify({method,args:[]})
      });
      return {status:response.status,body:await response.json()};
    }
    const a=rpc('a','hold');
    const b=rpc('b','hold');
    await bothEntered.promise;
    assert.deepEqual(await rpc('c','quick'),{
      status:429,body:{ok:false,error:'Too many requests'}
    });
    assert.deepEqual(completed,[],'Denied valid third account did no private work');
    release.resolve();
    assert.deepEqual(await Promise.all([a,b]),[
      {status:200,body:{ok:true,value:'held'}},
      {status:200,body:{ok:true,value:'held'}}
    ]);
    assert.deepEqual(await rpc('c','quick'),{
      status:200,body:{ok:true,value:'quick'}
    });
    assert.deepEqual(completed,['hold','hold','quick']);
  }finally{
    release.resolve();
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});


test('SCO total cap reserves capacity before async principal resolution finishes',async()=>{
  const started=gate();
  const release=gate();
  let resolutions=0;
  /** @type {string[]} */
  const effects=[];
  const isolate=createScoKeyedIsolation(async()=>{
    resolutions++;
    started.resolve();
    await release.promise;
    return 'verified';
  },{maxPendingTotal:1,maxPendingPerPrincipal:2});
  const first=isolate(requestFor('first'),async()=>{effects.push('first');});
  await started.promise;
  const second=isolate(requestFor('second'),async()=>{effects.push('second');});
  const secondOutcome=second.then(()=>null,error=>error);
  try{
    await Promise.resolve();
    assert.equal(resolutions,1,'A full queue must refuse before another resolver runs');
    const error=await secondOutcome;
    assert.ok(error instanceof ScoIsolationBusyError);
    assert.deepEqual(effects,[]);
    release.resolve();
    await first;
    await isolate(requestFor('recovered'),async()=>{effects.push('recovered');});
    assert.deepEqual(effects,['first','recovered']);
  }finally{
    release.resolve();
    await Promise.allSettled([first,second]);
  }
});

test('SCO global cap is released after failed asynchronous principal resolution',async()=>{
  let attempts=0;
  const isolate=createScoKeyedIsolation(async()=>{
    attempts++;
    if(attempts===1)throw Error('private-principal-resolution');
    return 'verified';
  },{maxPendingTotal:1});
  let effects=0;
  await assert.rejects(isolate(requestFor('first'),async()=>{effects++;}),
    /private-principal-resolution/);
  await isolate(requestFor('second'),async()=>{effects++;});
  assert.equal(attempts,2);
  assert.equal(effects,1);
});

test('SCO HTTP 429 is enforced while a global-cap principal lookup is unresolved',{
  timeout:15000
},async()=>{
  const started=gate();
  const release=gate();
  let lookups=0;
  let privateEffects=0;
  const isolate=createScoKeyedIsolation(async()=>{
    lookups++;
    started.resolve();
    await release.promise;
    return 'verified-account';
  },{maxPendingTotal:1});
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{read:()=>{privateEffects++;return 17;}},
    authorizeRpc:()=>true,
    runRpcIsolated:isolate
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected HTTP listener');
    const url='http://127.0.0.1:'+address.port+'/obfs/rpc';
    const init={method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:'read',args:[]})};
    const first=fetch(url,init);
    await started.promise;
    const second=await fetch(url,{...init,signal:AbortSignal.timeout(3000)});
    assert.equal(second.status,429);
    assert.deepEqual(await second.json(),{ok:false,error:'Too many requests'});
    assert.equal(lookups,1,'The overflow must not enter the identity resolver');
    assert.equal(privateEffects,0);
    release.resolve();
    const firstReply=await first;
    assert.equal(firstReply.status,200);
    assert.equal((await firstReply.json()).value,17);
    const recovered=await fetch(url,init);
    assert.equal(recovered.status,200);
    assert.equal((await recovered.json()).value,17);
    assert.equal(privateEffects,2);
  }finally{
    release.resolve();
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
