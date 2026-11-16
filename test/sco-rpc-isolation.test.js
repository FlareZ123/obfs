'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler,createScoBatchMethod,preflightScoBatchState}=require('../src');

/**
 * @returns {{promise:Promise<void>,resolve:()=>void}}
 */
function latch() {
  /** @type {()=>void} */
  let release=()=>{};
  const promise=new Promise(resolve=>{release=()=>resolve();});
  return {promise,resolve:release};
}

/**
 * @param {number} port
 * @param {string} method
 * @param {unknown[]} args
 * @returns {Promise<{status:number,body:any}>}
 */
async function invoke(port,method,args) {
  const response=await fetch('http://127.0.0.1:'+port+'/obfs/rpc',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({method,args})
  });
  return {status:response.status,body:await response.json()};
}

/** @param {import('node:http').Server} server @returns {Promise<number>} */
async function listen(server) {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Expected listener');
  return address.port;
}

/** @param {import('node:http').Server} server @returns {Promise<void>} */
async function close(server) {
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}

/**
 * A complete two-operation model that admits a pair of reads but makes
 * revocation invalidate subsequent reads. Interleaving another authorized
 * request between two batch members can violate its predicted state.
 *
 * @param {boolean} isolated
 */
function fixture(isolated) {
  const entered=latch();
  const release=latch();
  const queued=latch();
  const state={active:true};
  /** @type {string[]} */
  const effects=[];
  let reads=0;
  let isolationCalls=0;
  let tail=Promise.resolve();
  const methods={
    read:async()=>{
      reads++;
      if(reads===1) {
        entered.resolve();
        await release.promise;
      }
      effects.push('read:'+(state.active?'active':'revoked'));
      return 'private-value';
    },
    revoke:()=>{
      state.active=false;
      effects.push('revoke');
      return 'revoked';
    }
  };
  const model={
    /** @param {boolean} active @param {string} method @param {unknown[]} args */
    authorize:(active,method,args)=>active &&
      (method==='read'||method==='revoke') && args.length===0,
    /** @param {boolean} active @param {string} method */
    transition:(active,method)=>method==='revoke'?false:active
  };
  /**
   * @param {import('node:http').IncomingMessage} request
   * @param {()=>Promise<void>} execute
   * @returns {Promise<void>}
   */
  async function runRpcIsolated(request,execute) {
    isolationCalls++;
    if(isolationCalls===2)queued.resolve();
    const previous=tail;
    const current=latch();
    tail=current.promise;
    await previous;
    try{
      await execute();
    }finally{
      current.resolve();
    }
  }
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{...methods,batch:createScoBatchMethod(methods)},
    authorizeRpc:()=>state.active,
    authorizeOperation:(request,method,args)=>{
      if(method==='batch')return args.length===1 &&
        preflightScoBatchState(args[0],state.active,model);
      return model.authorize(state.active,method,args);
    },
    ...(isolated?{runRpcIsolated}:{})
  }));
  return {server,entered,release,queued,effects,state};
}

test('SCO state-transition preflight alone permits a concurrent revocation interleave',{
  timeout:10000
},async()=>{
  const f=fixture(false);
  const port=await listen(f.server);
  try{
    const batch=invoke(port,'batch',[[
      {method:'read',args:[]},
      {method:'read',args:[]}
    ]]);
    await f.entered.promise;
    const revoked=await invoke(port,'revoke',[]);
    assert.deepEqual(revoked,{status:200,body:{ok:true,value:'revoked'}});
    f.release.resolve();
    const result=await batch;
    assert.equal(result.status,200);
    assert.deepEqual(result.body.value,[
      {ok:true,value:'private-value'},
      {ok:true,value:'private-value'}
    ]);
    assert.deepEqual(f.effects,['revoke','read:revoked','read:revoked']);
    assert.equal(f.state.active,false);
  }finally{
    f.release.resolve();
    await close(f.server);
  }
});

test('SCO runRpcIsolated can serialize authorization and batch execution',{
  timeout:10000
},async()=>{
  const f=fixture(true);
  const port=await listen(f.server);
  try{
    const batch=invoke(port,'batch',[[
      {method:'read',args:[]},
      {method:'read',args:[]}
    ]]);
    await f.entered.promise;
    const revoke=invoke(port,'revoke',[]);
    await f.queued.promise;
    assert.deepEqual(f.effects,[],'The second request has reached the isolation queue');
    f.release.resolve();
    const batchResponse=await batch;
    const revoked=await revoke;
    assert.equal(batchResponse.status,200);
    assert.deepEqual(batchResponse.body.value,[
      {ok:true,value:'private-value'},
      {ok:true,value:'private-value'}
    ]);
    assert.deepEqual(revoked,{status:200,body:{ok:true,value:'revoked'}});
    assert.deepEqual(f.effects,['read:active','read:active','revoke']);
    assert.equal(f.state.active,false);
    const denied=await invoke(port,'read',[]);
    assert.deepEqual(denied,{status:403,body:{ok:false,error:'Forbidden'}});
  }finally{
    f.release.resolve();
    await close(f.server);
  }
});

test('SCO validates the isolation callback and suppresses its private errors',async()=>{
  assert.throws(()=>createScoHandler([],{
    remoteMethods:{value:()=>1},
    authorizeRpc:()=>true,
    runRpcIsolated:/** @type {any} */ ('mutex')
  }),/runRpcIsolated must be a function/);
  const effects=[];
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{value:()=>{effects.push('value');return 7;}},
    authorizeRpc:()=>true,
    runRpcIsolated:async()=>{throw new Error('private-lock-failure');}
  }));
  const port=await listen(server);
  try{
    const reply=await invoke(port,'value',[]);
    assert.deepEqual(reply,{status:500,body:{ok:false,error:'Operation failed'}});
    assert.deepEqual(effects,[]);
    assert.ok(!JSON.stringify(reply).includes('private-lock-failure'));
  }finally{
    await close(server);
  }
});

test('SCO refuses a detached isolation execute callback after a failed request',async()=>{
  /** @type {null|(()=>Promise<void>)} */
  let captured=null;
  let privateRuns=0;
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{value:()=>{privateRuns++;return 19;}},
    authorizeRpc:()=>true,
    // A buggy integration may retain the execution capability without
    // awaiting it. The handler must invalidate it when this scope ends.
    runRpcIsolated:async(_request,execute)=>{captured=execute;}
  }));
  const port=await listen(server);
  try{
    const reply=await invoke(port,'value',[]);
    assert.deepEqual(reply,{status:500,body:{ok:false,error:'Operation failed'}});
    assert.equal(privateRuns,0);
    assert.equal(typeof captured,'function');
    const late=/** @type {()=>Promise<void>} */ (captured);
    await assert.rejects(late(),/RPC isolation execution scope has closed/);
    assert.equal(privateRuns,0,'A failed HTTP request cannot leave a live private execution capability');
  }finally{
    await close(server);
  }
});
