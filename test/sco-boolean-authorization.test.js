'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler,createScoBatchMethod}=require('../src');

/**
 * @param {NonNullable<Parameters<typeof createScoHandler>[1]>} options
 * @param {(port:number)=>Promise<void>} run
 * @returns {Promise<void>}
 */
async function withServer(options,run) {
  const server=http.createServer(createScoHandler([
    {path:'public.js',sourceType:'script',code:'globalThis.publicReady=1;'}
  ],options));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected TCP listener');
    await run(address.port);
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

/** @param {number} port @param {unknown} body @returns {Promise<{status:number,payload:any}>} */
async function rpc(port,body) {
  const response=await fetch('http://127.0.0.1:'+port+'/obfs/rpc',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
  });
  return {status:response.status,payload:await response.json()};
}

test('SCO coarse RPC gate denies all truthy nonboolean authorization values',async()=>{
  const results=[
    ()=>1,
    ()=>'allowed',
    ()=>({identity:'user'}),
    ()=>new Boolean(true),
    async()=>({identity:'user'})
  ];
  for(const authorizeRpc of results) {
    let effects=0;
    await withServer({
      remoteMethods:{private:()=>++effects},
      authorizeRpc:/** @type {any} */ (authorizeRpc)
    },async port=>{
      assert.deepEqual(await rpc(port,{method:'private',args:[]}),
        {status:403,payload:{ok:false,error:'Forbidden'}});
    });
    assert.equal(effects,0);
  }
});

test('SCO coarse gate enforces exact true inside isolation scope',async()=>{
  let effects=0;
  await withServer({
    remoteMethods:{private:()=>++effects},
    authorizeRpc:/** @type {any} */ (async()=>({identity:'user'})),
    runRpcIsolated:async(request,execute)=>{await execute();}
  },async port=>{
    assert.equal((await rpc(port,{method:'private',args:[]})).status,403);
  });
  assert.equal(effects,0);
});

test('SCO method gate denies truthy nonboolean decisions',async()=>{
  let effects=0;
  await withServer({
    remoteMethods:{private:()=>++effects},
    authorizeRpc:()=>true,
    authorizeOperation:/** @type {any} */ (()=>'allowed')
  },async port=>{
    assert.equal((await rpc(port,{method:'private',args:[]})).status,403);
  });
  assert.equal(effects,0);
});

test('SCO recognized batch refuses a truthy nonboolean inner authorization',async()=>{
  let effects=0;
  await withServer({
    remoteMethods:{batch:createScoBatchMethod({private:()=>++effects})},
    authorizeRpc:()=>true,
    authorizeOperation:/** @type {any} */ ((request,method)=>
      method==='batch'?true:{identity:'user'})
  },async port=>{
    const body={method:'batch',args:[[{method:'private',args:[]}]]};
    assert.equal((await rpc(port,body)).status,403);
  });
  assert.equal(effects,0);
});

test('SCO source-read gate denies truthy nonboolean decisions',async()=>{
  for(const authorizeRead of [()=>1,()=>({identity:'user'}),async()=>'allowed']) {
    await withServer({
      authorizeRead:/** @type {any} */ (authorizeRead)
    },async port=>{
      const response=await fetch('http://127.0.0.1:'+port+'/obfs/public.js');
      assert.equal(response.status,403);
    });
  }
});

test('SCO explicit boolean policies still authorize both reads and RPC',async()=>{
  let effects=0;
  await withServer({
    remoteMethods:{private:()=>++effects},
    authorizeRpc:async()=>true,
    authorizeOperation:()=>true,
    authorizeRead:async()=>true
  },async port=>{
    assert.equal((await rpc(port,{method:'private',args:[]})).status,200);
    const read=await fetch('http://127.0.0.1:'+port+'/obfs/public.js');
    assert.equal(read.status,200);
  });
  assert.equal(effects,1);
});
