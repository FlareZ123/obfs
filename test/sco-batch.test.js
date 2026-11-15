'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoBatchMethod,createScoHandler}=require('../src');

test('SCO batch validates all calls before executing and preserves ordered results',async()=>{
  /** @type {number[]} */
  const observed=[];
  const methods={
    /** @param {number} value */
    step:value=>{observed.push(value);return value*3;},
    broken:()=>{throw new Error('secret-internal-error');}
  };
  const batch=createScoBatchMethod(methods,{maxCalls:3});
  await assert.rejects(batch([
    {method:'step',args:[1]},
    {method:'missing',args:[]}
  ]),/Invalid or oversized/);
  await assert.rejects(batch([
    {method:'step',args:[1]},
    {method:'step',args:[2]},
    {method:'step',args:[3]},
    {method:'step',args:[4]}
  ]),/Invalid or oversized/);
  assert.deepEqual(observed,[],'Invalid batches must not partially execute');
  const results=await batch([
    {method:'step',args:[3]},
    {method:'broken',args:[]},
    {method:'step',args:[7]}
  ]);
  assert.deepEqual(observed,[3,7]);
  assert.deepEqual(results,[
    {ok:true,value:9},
    {ok:false,error:'Operation failed'},
    {ok:true,value:21}
  ]);
  assert.throws(()=>createScoBatchMethod({}),/nonempty/);
  assert.throws(()=>createScoBatchMethod({step:()=>1,batch:()=>2}),/nested batch/);
  assert.throws(()=>createScoBatchMethod({step:()=>1},{maxCalls:0}),/maxCalls/);
});

test('SCO batch RPC uses the existing authorization gate and suppresses private exceptions',async()=>{
  /** @type {number[]} */
  const effects=[];
  const privateError='do-not-ship-this-server-exception';
  const methods={
    /** @param {number} value */
    increment:value=>{effects.push(value);return value+1;},
    fail:()=>{throw new Error(privateError);}
  };
  const server=http.createServer(createScoHandler([
    {path:'client.js',sourceType:'script',code:'globalThis.enabled=true;'}
  ],{
    remoteMethods:{...methods,batch:createScoBatchMethod(methods,{maxCalls:4})},
    authorizeRpc:request=>request.headers.cookie==='session=allow'
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Expected TCP listener');
    const endpoint='http://127.0.0.1:'+address.port+'/obfs/rpc';

    /**
     * @param {boolean} authorized
     * @param {unknown} body
     * @returns {Promise<{status:number,body:any}>}
     */
    async function send(authorized,body) {
      const response=await fetch(endpoint,{
        method:'POST',
        headers:{'content-type':'application/json',...(authorized?{cookie:'session=allow'}:{})},
        body:JSON.stringify(body)
      });
      return {status:response.status,body:await response.json()};
    }

    const commands=[
      {method:'increment',args:[4]},
      {method:'fail',args:[]},
      {method:'increment',args:[5]}
    ];
    const forbidden=await send(false,{method:'batch',args:[commands]});
    assert.equal(forbidden.status,403);
    assert.deepEqual(forbidden.body,{ok:false,error:'Forbidden'});
    assert.deepEqual(effects,[]);

    const accepted=await send(true,{method:'batch',args:[commands]});
    assert.equal(accepted.status,200);
    assert.deepEqual(accepted.body,{
      ok:true,value:[
        {ok:true,value:5},
        {ok:false,error:'Operation failed'},
        {ok:true,value:6}
      ]
    });
    assert.ok(!JSON.stringify(accepted.body).includes(privateError));
    assert.deepEqual(effects,[4,5]);

    const invalid=await send(true,{method:'batch',args:[[...commands,...commands]]});
    assert.equal(invalid.status,500);
    assert.deepEqual(invalid.body,{ok:false,error:'Operation failed'});
    assert.deepEqual(effects,[4,5],'Preflight rejection prevents additional side effects');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
