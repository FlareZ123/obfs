'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler}=require('../src/sco');
const {createScoKeyedIsolation}=require('../src/rpc-keyed-isolation');

/** @returns {{promise:Promise<void>,resolve:()=>void}} */
function gate() {
  /** @type {()=>void} */
  let resolve=()=>{};
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}

/**
 * @param {import('node:http').RequestListener} handler
 * @returns {Promise<{server:import('node:http').Server,url:string}>}
 */
async function start(handler) {
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  assert.ok(address && typeof address!=='string');
  return {server,url:'http://127.0.0.1:'+address.port+'/obfs/rpc'};
}

/**
 * @param {import('node:http').Server} server
 * @returns {Promise<void>}
 */
async function close(server) {
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}

/**
 * @param {string} url
 * @param {string} credential
 * @param {string} [body]
 * @returns {Promise<{status:number,body:any}>}
 */
async function rpc(url,credential,body='{"method":"check","args":[]}') {
  const response=await fetch(url,{
    method:'POST',
    headers:{'content-type':'application/json','x-fixture-credential':credential},
    body,
    signal:AbortSignal.timeout(4000)
  });
  return {status:response.status,body:await response.json()};
}

test('SCO pre-admission requires an isolation wrapper and a function',()=>{
  const settings={remoteMethods:{check:()=>7},authorizeRpc:()=>true};
  assert.throws(()=>createScoHandler([],{...settings,admitRpcEarly:()=>true}),
    /admitRpcEarly requires runRpcIsolated/);
  const isolate=async(/** @type {import('node:http').IncomingMessage} */request,
    /** @type {()=>Promise<void>} */execute)=>{void request;await execute();};
  for(const invalid of [null,false,true,'yes',1,{}]) {
    assert.throws(()=>createScoHandler([],{...settings,runRpcIsolated:isolate,
      admitRpcEarly:/** @type {any} */(invalid)}),/admitRpcEarly must be a function/);
  }
});

test('SCO denial-only admission rejects before JSON parsing and does not grant final authorization',async()=>{
  let lookups=0,checks=0,effects=0;
  let revoked=false;
  const isolate=createScoKeyedIsolation(async()=>{
    lookups++;
    return 'verified-account';
  },{maxPendingTotal:1,maxPendingPerPrincipal:1});
  const options={
    remoteMethods:{check:()=>{effects++;return effects;}},
    authorizeRpc:()=>{checks++;return !revoked;},
    admitRpcEarly:(/** @type {import('node:http').IncomingMessage} */req)=>
      req.headers['x-fixture-credential']==='verified',
    runRpcIsolated:isolate
  };
  const {server,url}=await start(createScoHandler([],options));
  try{
    assert.deepEqual(await rpc(url,'unauthenticated','{'),{
      status:403,body:{ok:false,error:'Forbidden'}
    },'Early denial precedes malformed JSON and principal resolution');
    assert.equal(lookups,0);
    assert.equal(checks,0);
    assert.equal(effects,0);
    assert.deepEqual(await rpc(url,'verified'),{
      status:200,body:{ok:true,value:1}
    });
    assert.equal(lookups,1);
    assert.equal(checks,1);
    revoked=true;
    assert.deepEqual(await rpc(url,'verified'),{
      status:403,body:{ok:false,error:'Forbidden'}
    },'True early admission cannot override final stateful revocation');
    assert.equal(lookups,2);
    assert.equal(checks,2);
    assert.equal(effects,1);
  }finally{await close(server);}
});

test('SCO pre-admission prevents unauthenticated global principal-lookup slot starvation',async()=>{
  const entered=gate(),release=gate();
  let lookups=0,privateEffects=0;
  const principalOf=async(/** @type {import('node:http').IncomingMessage} */request)=>{
    lookups++;
    if(request.headers['x-fixture-credential']==='unauthenticated') {
      entered.resolve();
      await release.promise;
      return 'unverified';
    }
    return 'verified';
  };
  /** @type {import('../src/sco').ScoOptions} */
  const settings={
    remoteMethods:{check:()=>{privateEffects++;return 'ok';}},
    authorizeRpc:request=>request.headers['x-fixture-credential']==='verified',
    runRpcIsolated:createScoKeyedIsolation(principalOf,{
      maxPendingTotal:1,maxPendingPerPrincipal:1
    })
  };
  const baseline=await start(createScoHandler([],settings));
  try{
    const invalid=rpc(baseline.url,'unauthenticated');
    await entered.promise;
    assert.deepEqual(await rpc(baseline.url,'verified'),{
      status:429,body:{ok:false,error:'Too many requests'}
    },'An unresolved unverified principal can hold the one global reservation');
    release.resolve();
    assert.deepEqual(await invalid,{
      status:403,body:{ok:false,error:'Forbidden'}
    });
    assert.equal(lookups,1,'Rejected authenticated call never enters resolver at global cap');
    assert.equal(privateEffects,0);
  }finally{release.resolve();await close(baseline.server);}

  lookups=0;
  const protectedSettings={...settings,
    // This syntactic token is only a test fixture, not a production verifier.
    // Production pre-admission MUST validate authenticated credentials.
    admitRpcEarly:(/** @type {import('node:http').IncomingMessage} */request)=>
      request.headers['x-fixture-credential']==='verified'
  };
  const protectedServer=await start(createScoHandler([],protectedSettings));
  try{
    assert.deepEqual(await rpc(protectedServer.url,'unauthenticated'),{
      status:403,body:{ok:false,error:'Forbidden'}
    });
    assert.equal(lookups,0,'Pre-admission denied before reserving a global slot');
    assert.deepEqual(await rpc(protectedServer.url,'verified'),{
      status:200,body:{ok:true,value:'ok'}
    });
    assert.equal(lookups,1);
    assert.equal(privateEffects,1);
  }finally{await close(protectedServer.server);}
});

test('SCO denial-only callback is snapped and truthy nonbooleans cannot grant admission',async()=>{
  let getterReads=0,callbacks=0,checks=0;
  const settings={
    remoteMethods:{check:()=>9},
    authorizeRpc:()=>{checks++;return true;},
    runRpcIsolated:createScoKeyedIsolation(()=>'verified'),
    get admitRpcEarly() {getterReads++;return ()=>{callbacks++;return false;};}
  };
  const handler=createScoHandler([],settings);
  assert.equal(getterReads,1);
  const {server,url}=await start(handler);
  try{
    for(let i=0;i<2;i++)assert.deepEqual(await rpc(url,'verified'),{
      status:403,body:{ok:false,error:'Forbidden'}
    });
    assert.equal(getterReads,1);
    assert.equal(callbacks,2);
    assert.equal(checks,0);
  }finally{await close(server);}

  const other=await start(createScoHandler([],{
    remoteMethods:{check:()=>12},
    authorizeRpc:()=>{checks++;return true;},
    runRpcIsolated:createScoKeyedIsolation(()=>'verified'),
    admitRpcEarly:()=>/** @type {any} */({verified:true})
  }));
  try{
    assert.deepEqual(await rpc(other.url,'verified'),{
      status:403,body:{ok:false,error:'Forbidden'}
    });
    assert.equal(checks,0,'Truthy preflight result is not treated as authorization');
  }finally{await close(other.server);}
});
