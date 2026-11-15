'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler,createScoBatchMethod}=require('../src');

/**
 * Send a real HTTP RPC request to a listening SCO handler.
 * @param {number} port
 * @param {unknown} payload
 * @returns {Promise<{status:number,body:any}>}
 */
async function invoke(port,payload) {
  const response=await fetch('http://127.0.0.1:'+port+'/obfs/rpc',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(payload)
  });
  return {status:response.status,body:await response.json()};
}

/**
 * @param {import('node:http').Server} server
 * @returns {Promise<number>}
 */
async function listen(server) {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Expected TCP listener');
  return address.port;
}

/** @param {import('node:http').Server} server @returns {Promise<void>} */
async function close(server) {
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}

test('SCO checks the authorization policy for all inner batch calls before effects',async()=>{
  /** @type {number[]} */
  const effects=[];
  /** @type {string[]} */
  const checked=[];
  const methods={
    /** @param {number} n */
    charge:n=>{effects.push(n);return n*10;}
  };
  // The inner method is deliberately absent from the public RPC registry.
  // Merely allowing the batch route must not authorize arbitrary operations.
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{batch:createScoBatchMethod(methods,{maxCalls:4})},
    authorizeRpc:()=>true,
    authorizeOperation:(request,method,args)=>{
      checked.push(method);
      return method==='batch' || method==='charge' && args.length===1 &&
        Number.isSafeInteger(args[0]) && args[0]>=0 && args[0]<=2;
    }
  }));
  const port=await listen(server);
  try {
    const prohibited=await invoke(port,{method:'batch',args:[[
      {method:'charge',args:[1]},
      {method:'charge',args:[99]}
    ]]});
    assert.deepEqual(prohibited,{status:403,body:{ok:false,error:'Forbidden'}});
    assert.deepEqual(effects,[],'A denied later item must prevent all earlier effects');
    assert.deepEqual(checked,['batch','charge','charge']);

    checked.length=0;
    const permitted=await invoke(port,{method:'batch',args:[[
      {method:'charge',args:[1]},
      {method:'charge',args:[2]}
    ]]});
    assert.deepEqual(permitted,{status:200,body:{ok:true,value:[
      {ok:true,value:10},{ok:true,value:20}
    ]}});
    assert.deepEqual(effects,[1,2]);
    assert.deepEqual(checked,['batch','charge','charge']);
  } finally {
    await close(server);
  }
});

test('SCO hides rejected inner-operation policy errors and preserves state',async()=>{
  let effects=0;
  const secret='sensitive-authorization-implementation-detail';
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{batch:createScoBatchMethod({privateOp:()=>++effects})},
    authorizeRpc:()=>true,
    authorizeOperation:(request,method)=>{
      if(method==='privateOp')throw Error(secret);
      return method==='batch';
    }
  }));
  const port=await listen(server);
  try {
    const reply=await invoke(port,{method:'batch',args:[[{method:'privateOp',args:[]}]]});
    assert.deepEqual(reply,{status:500,body:{ok:false,error:'Operation failed'}});
    assert.equal(effects,0);
    assert.ok(!JSON.stringify(reply).includes(secret));
  } finally {
    await close(server);
  }
});

test('SCO rejects a nested recognized batch even under a disguised registry key',()=>{
  const inner=createScoBatchMethod({privateOp:()=>17});
  assert.throws(()=>createScoBatchMethod({nested:inner}),/nested batch/i);
  assert.throws(()=>createScoBatchMethod({batch:inner}),/nested batch/i);
});
