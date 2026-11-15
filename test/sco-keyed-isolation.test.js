'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoKeyedIsolation}=require('../src/rpc-keyed-isolation');
const {createScoHandler}=require('../src');

/** @returns {{promise:Promise<void>,resolve:()=>void}} */
function gate() {
  /** @type {()=>void} */
  let resolve=()=>{};
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}

/** @param {string} principal @returns {import('node:http').IncomingMessage} */
function requestFor(principal) {
  return /** @type {import('node:http').IncomingMessage} */ (/** @type {unknown} */ ({principal}));
}

/** @param {import('node:http').IncomingMessage} request @returns {string} */
function readPrincipal(request) {
  return /** @type {any} */ (request).principal;
}

test('SCO keyed isolation queues a principal in FIFO order and releases on failure',async()=>{
  const isolate=createScoKeyedIsolation(readPrincipal);
  const started=gate();
  const finish=gate();
  /** @type {string[]} */
  const order=[];
  const req=requestFor('account-1');
  const first=isolate(req,async()=>{
    order.push('first-start');started.resolve();await finish.promise;
    order.push('first-end');
  });
  await started.promise;
  const second=isolate(req,async()=>{order.push('second');throw Error('private-failure');});
  const third=isolate(req,async()=>{order.push('third');});
  await Promise.resolve();
  assert.deepEqual(order,['first-start']);
  finish.resolve();
  await first;
  await assert.rejects(second,/private-failure/);
  await third;
  assert.deepEqual(order,['first-start','first-end','second','third']);
  await isolate(req,async()=>{order.push('fourth');});
  assert.equal(order.at(-1),'fourth','No stale per-principal lock remains');
});

test('SCO keyed isolation allows different authenticated principals to progress independently',async()=>{
  const isolate=createScoKeyedIsolation(readPrincipal);
  const started=gate();
  const release=gate();
  const slow=isolate(requestFor('account-A'),async()=>{
    started.resolve();await release.promise;
  });
  await started.promise;
  let fastRan=false;
  await isolate(requestFor('account-B'),async()=>{fastRan=true;});
  assert.equal(fastRan,true,'Independent principal must not wait for A');
  release.resolve();
  await slow;
});

test('SCO keyed isolation refuses invalid principal keys before work',async()=>{
  assert.throws(()=>createScoKeyedIsolation(/** @type {any} */ (null)),/principalOf/);
  let invoked=false;
  for(const name of ['', 'x'.repeat(257), /** @type {any} */ (3)]) {
    const isolate=createScoKeyedIsolation(()=>name);
    await assert.rejects(isolate(requestFor('ignored'),async()=>{invoked=true;}),/Authenticated principal/);
  }
  assert.equal(invoked,false);
});

/**
 * @param {number} port
 * @param {string} token
 * @param {string} method
 * @returns {Promise<{status:number,body:any}>}
 */
async function rpc(port,token,method){
  const reply=await fetch('http://127.0.0.1:'+port+'/obfs/rpc',{
    method:'POST',headers:{'content-type':'application/json','x-test-session':token},
    body:JSON.stringify({method,args:[]})
  });
  return {status:reply.status,body:await reply.json()};
}

test('SCO keyed isolation denies a concurrent read after a revocation commits',{
  timeout:15000
},async()=>{
  const entered=gate();
  const proceed=gate();
  const queued=gate();
  let observed=0;
  let active=true;
  let protectedReads=0;
  const isolation=createScoKeyedIsolation(request=>{
    observed++;
    if(observed===2)queued.resolve();
    // This is a fixture token. A deployment must resolve a verified session.
    return request.headers['x-test-session']==='approved'?'authenticated-account':'unauthorized';
  });
  const server=http.createServer(createScoHandler([] ,{
    remoteMethods:{
      revoke:async()=>{
        entered.resolve();await proceed.promise;
        active=false;return true;
      },
      read:()=>{protectedReads++;return 'private-data';}
    },
    authorizeRpc:request=>request.headers['x-test-session']==='approved',
    authorizeOperation:(request,method)=>active && (method==='read'||method==='revoke'),
    runRpcIsolated:isolation
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected bound server');
    const port=address.port;
    const revoked=rpc(port,'approved','revoke');
    await entered.promise;
    const read=rpc(port,'approved','read');
    await queued.promise;
    assert.equal(protectedReads,0);
    proceed.resolve();
    assert.deepEqual(await revoked,{status:200,body:{ok:true,value:true}});
    assert.deepEqual(await read,{status:403,body:{ok:false,error:'Forbidden'}});
    assert.equal(protectedReads,0,'Denied RPC did not reach protected operation');
    assert.deepEqual(await rpc(port,'rejected','read'),{
      status:403,body:{ok:false,error:'Forbidden'}
    });
  }finally{
    proceed.resolve();
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
