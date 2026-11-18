'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const test=require('node:test');
const {createScoBatchMethod,createScoHandler}=require('../src');

/**
 * @param {import('node:http').RequestListener} handler
 * @param {unknown} payload
 * @returns {Promise<{status:number,body:any}>}
 */
async function post(handler,payload){
  const server=http.createServer(handler);
  /** @type {Promise<void>} */
  const listening=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await listening;
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Expected TCP server address');
  try{
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/rpc',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(payload)
    });
    return {status:response.status,body:await response.json()};
  }finally{
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await closed;
  }
}

test('requireBatchPreflight rejects ambiguous wrapped or missing batch registrations',()=>{
  const batch=createScoBatchMethod({privateOp:()=>17});
  /** @param {any[]} calls */
  const forwarder=calls=>batch(calls);
  const common={
    authorizeRpc:()=>true,
    authorizeOperation:()=>true,
    requireBatchPreflight:['batch']
  };
  assert.doesNotThrow(()=>createScoHandler([],{
    ...common,
    remoteMethods:{batch}
  }));
  for(const wrapped of [batch.bind(null),new Proxy(batch,{}),forwarder]){
    assert.throws(()=>createScoHandler([],{
      ...common,
      remoteMethods:{batch:wrapped}
    }),/direct createScoBatchMethod helper/);
  }
  assert.throws(()=>createScoHandler([],{
    ...common,
    remoteMethods:{other:batch}
  }),/direct createScoBatchMethod helper/);
});

test('requireBatchPreflight validates its explicit security contract',()=>{
  const batch=createScoBatchMethod({privateOp:()=>17});
  assert.throws(()=>createScoHandler([],{
    remoteMethods:{batch},
    authorizeRpc:()=>true,
    requireBatchPreflight:['batch']
  }),/requires authorizeOperation/);
  assert.throws(()=>createScoHandler([],{
    remoteMethods:{batch},
    authorizeRpc:()=>true,
    authorizeOperation:()=>true,
    requireBatchPreflight:/** @type {any} */ ('batch')
  }),/must be an array/);
  assert.throws(()=>createScoHandler([],{
    remoteMethods:{batch},
    authorizeRpc:()=>true,
    authorizeOperation:()=>true,
    requireBatchPreflight:['batch','batch']
  }),/Duplicate requireBatchPreflight/);
  assert.throws(()=>createScoHandler([],{
    remoteMethods:{batch},
    authorizeRpc:()=>true,
    authorizeOperation:()=>true,
    requireBatchPreflight:['']
  }),/nonempty strings/);
});

test('declared direct batch keeps inner authorization fail-closed over HTTP',async()=>{
  let effects=0;
  const batch=createScoBatchMethod({
    forbidden:()=>{effects++;return 99;}
  });
  /** @type {string[]} */
  const observed=[];
  const handler=createScoHandler([],{
    remoteMethods:{batch},
    authorizeRpc:()=>true,
    authorizeOperation:(request,method)=>{
      observed.push(method);
      return method==='batch';
    },
    requireBatchPreflight:['batch']
  });
  const result=await post(handler,{
    method:'batch',
    args:[[{method:'forbidden',args:[]}]]
  });
  assert.equal(result.status,403);
  assert.equal(effects,0);
  assert.deepEqual(observed,['batch','forbidden']);
  assert.deepEqual(result.body,{ok:false,error:'Forbidden'});
});

test('requireBatchPreflight snapshots route names and registered task identity once',async()=>{
  let effects=0;
  let methodReads=0;
  let routeReads=0;
  const batch=createScoBatchMethod({
    forbidden:()=>{effects++;return 99;}
  });
  const wrapped=batch.bind(null);
  /** @type {Record<string,(...args:any[])=>unknown>} */
  const suppliedMethods={};
  Object.defineProperty(suppliedMethods,'batch',{
    enumerable:true,
    get(){
      methodReads++;
      return methodReads===1?batch:wrapped;
    }
  });
  /** @type {string[]} */
  const required=[];
  Object.defineProperty(required,0,{
    enumerable:true,
    get(){
      routeReads++;
      return routeReads===1?'batch':'other';
    }
  });
  required.length=1;
  /** @type {string[]} */
  const observed=[];
  const handler=createScoHandler([],{
    remoteMethods:suppliedMethods,
    authorizeRpc:()=>true,
    authorizeOperation:(request,method)=>{
      observed.push(method);
      return method==='batch';
    },
    requireBatchPreflight:required
  });
  assert.equal(methodReads,1);
  assert.equal(routeReads,1);

  const result=await post(handler,{
    method:'batch',
    args:[[{method:'forbidden',args:[]}]]
  });
  assert.equal(result.status,403);
  assert.equal(effects,0);
  assert.deepEqual(observed,['batch','forbidden']);
  assert.equal(methodReads,1,'request handling must use the construction snapshot');
  assert.equal(routeReads,1,'required route metadata must not be re-read');
});


test('requireBatchPreflight remains single-level when a registered leaf wraps another batch',async()=>{
  let effects=0;
  const inner=createScoBatchMethod({
    forbidden:()=>{effects++;return 99;}
  });
  /** @param {any[]} calls */
  const nested=calls=>inner(calls);
  const outer=createScoBatchMethod({nested});
  /** @type {Record<string,(...args:any[])=>unknown>} */
  const remoteMethods={batch:outer};
  /** @type {string[]} */
  const observed=[];
  const handler=createScoHandler([],{
    remoteMethods,
    authorizeRpc:()=>true,
    authorizeOperation:(request,method)=>{
      observed.push(method);
      return method==='batch'||method==='nested';
    },
    requireBatchPreflight:['batch']
  });
  const result=await post(handler,{
    method:'batch',
    args:[[{method:'nested',args:[[{method:'forbidden',args:[]}]]}]]
  });
  assert.equal(result.status,200);
  assert.equal(effects,1);
  assert.deepEqual(observed,['batch','nested']);
  assert.deepEqual(result.body,{
    ok:true,
    value:[{ok:true,value:[{ok:true,value:99}]}]
  });
});
