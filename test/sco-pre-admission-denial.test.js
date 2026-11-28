'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler}=require('../src/sco');
const {partitionScoSelectedAsyncExports,createScoSelectedHandler}=require('../src');
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


test('SCO pre-admission refuses asynchronous and thenable results without unhandled rejections',async()=>{
  let checks=0,privateEffects=0,index=0,thenableObserved=0;
  /** @type {Array<()=>unknown>} */
  const outcomes=[
    ()=>Promise.reject(Error('invalid-async-denial')),
    ()=>Promise.resolve(true),
    ()=>({
      then:(/** @type {(value:unknown)=>void} */resolve,
        /** @type {(reason:unknown)=>void} */reject)=>{
        void resolve;
        thenableObserved++;
        reject(Error('invalid-thenable-denial'));
      }
    }),
    ()=>{throw Error('synchronous-preflight-error');}
  ];
  const handler=createScoHandler([],{
    remoteMethods:{check:()=>{privateEffects++;return 17;}},
    authorizeRpc:()=>{checks++;return true;},
    runRpcIsolated:createScoKeyedIsolation(()=>'verified'),
    admitRpcEarly:/** @type {any} */(()=>outcomes[index++]())
  });
  const {server,url}=await start(handler);
  try {
    for(let i=0;i<3;i++){
      assert.deepEqual(await rpc(url,'verified'),{
        status:403,body:{ok:false,error:'Forbidden'}
      },'No thenable or promise result can grant early admission');
    }
    assert.deepEqual(await rpc(url,'verified'),{
      status:500,body:{ok:false,error:'Operation failed'}
    },'Synchronous admission exception is generic server error');
    await new Promise(resolve=>setTimeout(resolve,15));
    assert.equal(index,4);
    assert.equal(thenableObserved,1);
    assert.equal(checks,0);
    assert.equal(privateEffects,0);
  }finally{await close(server);}
});

test('SCO early denial preserves 403 while a legitimate principal occupies global capacity',async()=>{
  const entered=gate(),release=gate();
  let privateEffects=0,lookups=0,finalChecks=0,earlyChecks=0;
  const handler=createScoHandler([],{
    remoteMethods:{
      check:()=>{privateEffects++;return 'quick';},
      hold:async()=>{privateEffects++;entered.resolve();await release.promise;return 'held';}
    },
    authorizeRpc:request=>{
      finalChecks++;
      return request.headers['x-fixture-credential']==='verified';
    },
    admitRpcEarly:request=>{
      earlyChecks++;
      return request.headers['x-fixture-credential']==='verified';
    },
    runRpcIsolated:createScoKeyedIsolation(request=>{
      lookups++;
      return request.headers['x-fixture-credential']==='verified'?'V':'U';
    },{maxPendingTotal:1,maxPendingPerPrincipal:1})
  });
  const {server,url}=await start(handler);
  const first=rpc(url,'verified','{"method":"hold","args":[]}');
  try {
    await entered.promise;
    assert.deepEqual(await rpc(url,'unauthenticated'),{
      status:403,body:{ok:false,error:'Forbidden'}
    },'Denied outsider must not see queue-capacity 429');
    assert.equal(lookups,1,'No identity lookup for rejected outsider');
    assert.deepEqual(await rpc(url,'verified'),{
      status:429,body:{ok:false,error:'Too many requests'}
    },'Other valid requests remain subject to ordinary global limit');
    assert.equal(lookups,1,'Overflow does not resolve another identity');
    assert.equal(finalChecks,1,'Overflow cannot reach final authorization');
    assert.equal(earlyChecks,3);
    assert.equal(privateEffects,1,'Only admitted held method begins');
    release.resolve();
    assert.deepEqual(await first,{
      status:200,body:{ok:true,value:'held'}
    });
  }finally{
    release.resolve();
    await Promise.allSettled([first]);
    await close(server);
  }
});

test('selected SCO handler retains inherited nonenumerable early-admission callback exactly once',async()=>{
  const partition=partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',
    code:'export async function protectedCalc(x){return x+2;}'+
      'export function publicCalc(x){return x*3;}'
  },{seed:'sco-pre-admission-selected-entrypoint',privateNames:['protectedCalc']});
  let getterReads=0,earlyCalls=0,finalCalls=0,executions=0;
  const inherited=Object.create(null);
  Object.defineProperty(inherited,'admitRpcEarly',{
    enumerable:false,configurable:true,
    get(){
      getterReads++;
      return (/** @type {import('node:http').IncomingMessage} */request)=>{
        earlyCalls++;
        return request.headers['x-fixture-credential']==='verified';
      };
    }
  });
  /** @type {Omit<import('../src/sco').ScoOptions,'publicPaths'|'remoteMethods'>} */
  const options=Object.create(inherited);
  options.authorizeRpc=()=>{finalCalls++;return true;};
  options.runRpcIsolated=createScoKeyedIsolation(()=>'verified');
  const handler=createScoSelectedHandler(partition,{
    protectedCalc:async(/** @type {number} */x)=>{executions++;return x+2;},
    publicCalc:(/** @type {number} */x)=>x*3
  },options);
  assert.equal(getterReads,1,'Selected options must capture inherited callback once');
  const {server,url}=await start(handler);
  try {
    const body=JSON.stringify({
      method:partition.methodNames.protectedCalc,args:[4]
    });
    assert.deepEqual(await rpc(url,'unauthenticated',body),{
      status:403,body:{ok:false,error:'Forbidden'}
    });
    assert.deepEqual(await rpc(url,'verified',body),{
      status:200,body:{ok:true,value:6}
    });
    assert.equal(getterReads,1);
    assert.equal(earlyCalls,2);
    assert.equal(finalCalls,1);
    assert.equal(executions,1);
  }finally{await close(server);}
});
