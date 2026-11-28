'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {partitionScoAsyncGraph,partitionScoAsyncModule,createScoHandler}=require('../src');

const MARKER='SERVER_PRIVATE_FUNCTION_SOURCE_687291';
const source='export async function disclose(){const marker='+JSON.stringify(MARKER)+';return disclose.toString();}';

test('authorized SCO JSON RPC can carry exact private function body; compiler refuses that partition',async()=>{
  // Source withholding is a publication property, not an authorization-side
  // promise about arbitrary return values. This direct (unpartitioned) HTTP
  // control demonstrates the exact result an approved client can receive
  // when the private callback explicitly stringifies itself.
  const privateModule=await import('data:text/javascript,'+encodeURIComponent(source));
  const native=await privateModule.disclose();
  assert.ok(native.includes(MARKER));
  assert.ok(native.includes('return disclose.toString()'));
  const server=http.createServer(createScoHandler([{
    path:'public.mjs',sourceType:'module',
    code:'export async function ordinary(){return 7;}'
  }],{
    remoteMethods:{reveal:privateModule.disclose},
    authorizeRead:()=>true,authorizeRpc:()=>true
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const base='http://127.0.0.1:'+address.port+'/obfs/';
    const served=await fetch(base+'public.mjs');
    assert.equal(served.status,200);
    assert.equal((await served.text()).includes(MARKER),false);
    const response=await fetch(base+'rpc',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({method:'reveal',args:[]})
    });
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true,value:native});
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
  }
  assert.throws(()=>partitionScoAsyncGraph([{
    path:'private.mjs',code:source
  }],{seed:'private-return-source-guard',exposedPaths:['private.mjs']}),
  /private function source/u);
  assert.throws(()=>partitionScoAsyncModule({
    path:'private.mjs',sourceType:'module',code:source
  },{seed:'private-return-source-guard'}),/private function source/u);
});
