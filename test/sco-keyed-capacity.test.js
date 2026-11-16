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
  for(const maxPendingPerPrincipal of [0,-1,1.5,Number.NaN,Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>createScoKeyedIsolation(principalOf,{maxPendingPerPrincipal}),
      /maxPendingPerPrincipal/);
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
