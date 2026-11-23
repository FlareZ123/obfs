'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoBatchMethod,getScoBatchCalls}=require('../src/rpc-batch');
const {createScoHandler}=require('../src/sco');

/**
 * Execute JSON RPC against the actual local Node SCO HTTP handler.
 * @param {string} origin
 * @param {string} method
 * @param {unknown[]} args
 * @returns {Promise<Response>}
 */
function post(origin,method,args){
  return fetch(origin+'/obfs/rpc',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({method,args})
  });
}

test('recognized SCO batch rejects extra outer arguments without running a child',async()=>{
  /** @type {string[]} */
  const executed=[];
  const batch=createScoBatchMethod({
    child:async(/** @type {string} */ input)=>{executed.push(input);return input;}
  });
  const args=[[{method:'child',args:['denied']}],0];
  // The preflight returns [] when the outer arity is invalid. This is safe
  // only if the helper itself rejects those surplus arguments at execution.
  assert.deepEqual(getScoBatchCalls(batch,args),[]);
  await assert.rejects(
    Reflect.apply(batch,undefined,args),
    /Invalid or oversized RPC batch/
  );
  assert.deepEqual(executed,[]);
});

test('SCO HTTP preflight cannot be bypassed by surplus batch RPC arguments',async()=>{
  /** @type {string[]} */
  const executed=[];
  const child=async(/** @type {string} */ input)=>{
    executed.push(input);
    return input.toUpperCase();
  };
  const batch=createScoBatchMethod({child});
  const handler=createScoHandler([
    {path:'public.mjs',sourceType:'module',code:'export const marker=1;'}
  ],{
    publicPaths:['public.mjs'],
    remoteMethods:{batch},
    batchPreflightRoutes:['batch'],
    authorizeRpc:()=>true,
    authorizeOperation:(_request,method,args)=>
      method==='batch'||method==='child'&&args[0]!=='denied'
  });
  const server=http.createServer(handler);
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('No TCP address');
    const origin='http://127.0.0.1:'+address.port;
    const blocked=[{method:'child',args:['denied']}];
    const forbidden=await post(origin,'batch',[blocked]);
    assert.equal(forbidden.status,403);
    assert.deepEqual(executed,[]);

    // A two-argument RPC request must not be allowed to execute 'denied'.
    // Prior to the fix getScoBatchCalls skips the inner policy, but the
    // one-formal-parameter JavaScript helper executes its first argument.
    const bypass=await post(origin,'batch',[blocked,0]);
    assert.notEqual(bypass.status,200,'surplus-arity batch executed');
    assert.deepEqual(executed,[]);

    const accepted=await post(origin,'batch',[[{method:'child',args:['allowed']}]]);
    assert.equal(accepted.status,200);
    assert.deepEqual(await accepted.json(),{ok:true,value:[{ok:true,value:'ALLOWED'}]});
    assert.deepEqual(executed,['allowed']);
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
  }
});
