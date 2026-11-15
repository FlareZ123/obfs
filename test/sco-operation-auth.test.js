'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler,createScoBatchMethod}=require('../src');

/**
 * Send a JSON RPC request and read its response.
 * @param {number} port
 * @param {string|undefined} session
 * @param {unknown} message
 * @returns {Promise<{status:number,payload:any}>}
 */
async function rpc(port,session,message) {
  const response=await fetch('http://127.0.0.1:'+port+'/obfs/rpc',{
    method:'POST',
    headers:{'content-type':'application/json',...(session?{'x-session':session}:{})},
    body:JSON.stringify(message)
  });
  return {status:response.status,payload:await response.json()};
}

test('SCO rejects malformed operation authorizer at construction',()=>{
  assert.throws(()=>createScoHandler([
    {path:'entry.js',sourceType:'script',code:'globalThis.ready=1;'}
  ],{
    remoteMethods:{ready:()=>1},
    authorizeRpc:()=>true,
    authorizeOperation:/** @type {any} */ ('allow')
  }),/authorizeOperation must be a function/);
});

test('SCO authorizes methods and arguments after parsing, without invoking denied work',async()=>{
  const rejectedSentinel='secret-auth-policy-exception';
  /** @type {number[]} */
  const effects=[];
  /** @type {string[]} */
  const seen=[];
  const server=http.createServer(createScoHandler([
    {path:'entry.js',sourceType:'script',code:'globalThis.ready=1;'}
  ],{
    remoteMethods:{
      /** @param {number} value */
      debit:value=>{effects.push(value);return value*2;},
      fail:()=>{throw new Error('internal-method-exception');}
    },
    authorizeRpc:req=>req.headers['x-session']==='accepted',
    authorizeOperation:(req,method,args)=>{
      seen.push(method);
      if(method==='fail') throw new Error(rejectedSentinel);
      return req.headers['x-session']==='accepted' && method==='debit' &&
        args.length===1 && typeof args[0]==='number' && args[0]<=10;
    }
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if(!address || typeof address==='string')throw new Error('Expected TCP listener');
    const port=address.port;
    const deniedSession=await rpc(port,undefined,{method:'debit',args:[2]});
    assert.deepEqual(deniedSession,{status:403,payload:{ok:false,error:'Forbidden'}});
    const invalidMethod=await rpc(port,'accepted',{method:'unknown',args:[2]});
    assert.equal(invalidMethod.status,400);
    const invalidArgs=await rpc(port,'accepted',{method:'debit',args:'invalid'});
    assert.equal(invalidArgs.status,400);
    assert.deepEqual(seen,[]);

    const deniedAmount=await rpc(port,'accepted',{method:'debit',args:[11]});
    assert.deepEqual(deniedAmount,{status:403,payload:{ok:false,error:'Forbidden'}});
    assert.deepEqual(effects,[]);
    const allowed=await rpc(port,'accepted',{method:'debit',args:[7]});
    assert.deepEqual(allowed,{status:200,payload:{ok:true,value:14}});
    assert.deepEqual(effects,[7]);
    const failed=await rpc(port,'accepted',{method:'fail',args:[]});
    assert.deepEqual(failed,{status:500,payload:{ok:false,error:'Operation failed'}});
    assert.ok(!JSON.stringify(failed).includes(rejectedSentinel));
    assert.deepEqual(effects,[7]);
    assert.deepEqual(seen,['debit','debit','fail']);
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});

test('SCO authorizer can inspect all nested batch calls before side effects',async()=>{
  /** @type {number[]} */
  const effects=[];
  const operations={
    /** @param {number} value */
    score:value=>{effects.push(value);return value+5;}
  };
  const server=http.createServer(createScoHandler([
    {path:'entry.js',sourceType:'script',code:'globalThis.ready=1;'}
  ],{
    remoteMethods:{batch:createScoBatchMethod(operations)},
    authorizeRpc:()=>true,
    authorizeOperation:(request,method,args)=>{
      if(method!=='batch'||args.length!==1||!Array.isArray(args[0]))return false;
      return args[0].every(call=>call && call.method==='score' && Array.isArray(call.args) &&
        call.args.length===1 && Number.isSafeInteger(call.args[0]) && call.args[0]>=0 && call.args[0]<=3);
    }
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Expected TCP listener');
    const port=address.port;
    const rejected=await rpc(port,'accepted',{method:'batch',args:[[
      {method:'score',args:[2]},
      {method:'score',args:[99]}
    ]]});
    assert.deepEqual(rejected,{status:403,payload:{ok:false,error:'Forbidden'}});
    assert.deepEqual(effects,[],'Entire invalid batch must be refused before any call');
    const accepted=await rpc(port,'accepted',{method:'batch',args:[[
      {method:'score',args:[1]},
      {method:'score',args:[3]}
    ]]});
    assert.deepEqual(accepted,{status:200,payload:{ok:true,value:[
      {ok:true,value:6},{ok:true,value:8}
    ]}});
    assert.deepEqual(effects,[1,3]);
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
