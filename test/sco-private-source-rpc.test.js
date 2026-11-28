'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {partitionScoAsyncGraph,partitionScoAsyncModule,createScoHandler}=require('../src');

const MARKER='SERVER_PRIVATE_FUNCTION_SOURCE_687291';
const source='export async function disclose(){const marker='+JSON.stringify(MARKER)+';return disclose.toString();}';
// No single RPC result from this numeric oracle contains function source.
// An authorized caller with unrestricted query count can reconstruct it
// one UTF-16 code unit per request unless partitioning refuses the source.
const probeSource='export async function probe(i){const marker='+JSON.stringify(MARKER)+
  ';return String.prototype.charCodeAt.call(probe,i);}';

test('authorized SCO JSON RPC can carry exact private function body; compiler refuses that partition',async()=>{
  // Source withholding is a publication property, not an authorization-side
  // promise about arbitrary return values. This direct (unpartitioned) HTTP
  // control demonstrates the exact result an approved client can receive
  // when the private callback explicitly stringifies itself.
  const privateModule=await import('data:text/javascript,'+encodeURIComponent(source));
  const native=await privateModule.disclose();
  assert.ok(native.includes(MARKER));
  assert.ok(native.includes('return disclose.toString()'));
  const probed=await import('data:text/javascript,'+encodeURIComponent(probeSource));
  const hiddenProbeSource=probed.probe.toString();
  assert.ok(hiddenProbeSource.includes(MARKER));
  const server=http.createServer(createScoHandler([{
    path:'public.mjs',sourceType:'module',
    code:'export async function ordinary(){return 7;}'
  }],{
    remoteMethods:{reveal:privateModule.disclose,probe:probed.probe},
    authorizeRead:()=>true,
    authorizeRpc:req=>req.headers['x-test-token']==='allowed'
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const base='http://127.0.0.1:'+address.port+'/obfs/';
    const served=await fetch(base+'public.mjs');
    assert.equal(served.status,200);
    assert.equal((await served.text()).includes(MARKER),false);
    const unauthenticated=await fetch(base+'rpc',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({method:'reveal',args:[]})
    });
    assert.equal(unauthenticated.status,403);
    const response=await fetch(base+'rpc',{
      method:'POST',
      headers:{'content-type':'application/json','x-test-token':'allowed'},
      body:JSON.stringify({method:'reveal',args:[]})
    });
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true,value:native});
    // The attacker does NOT receive the source length, function
    // namespace, AST, or any private-module source; only a valid account
    // token, method name and HTTP endpoint. Out-of-range charCodeAt returns
    // NaN, which JSON serializes as null, providing an observable stop
    // signal without an external privileged length oracle.
    /** @type {string[]} */
    const units=[];
    let foundEnd=false;
    for(let i=0;i<8192;i++){
      const step=await fetch(base+'rpc',{
        method:'POST',
        headers:{'content-type':'application/json','x-test-token':'allowed'},
        body:JSON.stringify({method:'probe',args:[i]})
      });
      assert.equal(step.status,200);
      const payload=await step.json();
      assert.equal(payload.ok,true);
      if(payload.value===null){foundEnd=true;break;}
      assert.equal(typeof payload.value,'number');
      units.push(String.fromCharCode(payload.value));
    }
    assert.equal(foundEnd,true,'Unbounded attacker found the source end from JSON alone');
    assert.equal(units.join(''),hiddenProbeSource,
      'Length-blind numeric RPC reconstructs exact server-function source');
    assert.ok(units.join('').includes(MARKER));
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
  assert.throws(()=>partitionScoAsyncGraph([{
    path:'private.mjs',code:probeSource
  }],{seed:'private-numeric-source-guard',exposedPaths:['private.mjs']}),
  /private function source/u);
  assert.throws(()=>partitionScoAsyncModule({
    path:'private.mjs',sourceType:'module',code:probeSource
  },{seed:'private-numeric-source-guard'}),/private function source/u);
});
