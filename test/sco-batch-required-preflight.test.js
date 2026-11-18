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
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
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
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
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
    requireBatchPreflight:'batch'
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
