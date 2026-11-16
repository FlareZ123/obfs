'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {preflightScoBatchState}=require('../src');

/** @param {string[]} names @returns {{method:string,args:unknown[]}[]} */
function calls(names) {
  return names.map(method=>({method,args:[]}));
}

/**
 * A transition which returns a Promise must not be treated as a truthy
 * authorization state, even when it is the last step in the batch.
 */
test('modeled batch refuses async transitions on the final and intermediate steps',()=>{
  const policy={
    authorize:/** @param {unknown} state */ state=>Boolean(state),
    transition:/** @type {any} */ (async()=>false)
  };
  assert.throws(()=>preflightScoBatchState(calls(['revoke']),true,policy),
    /transition must return synchronously/);
  assert.throws(()=>preflightScoBatchState(calls(['revoke','read']),true,policy),
    /transition must return synchronously/);
});

/** The Promise protocol includes arbitrary callable thenables, not just native Promise. */
test('modeled batch refuses non-Promise thenable transition and initial state',()=>{
  const thenable={
    then:/** @param {(state:boolean)=>void} resolve */ resolve=>resolve(false)
  };
  const policy={
    authorize:/** @param {unknown} state */ state=>Boolean(state),
    transition:/** @type {any} */ (()=>thenable)
  };
  assert.throws(()=>preflightScoBatchState(calls(['revoke']),true,policy),
    /transition must return synchronously/);
  assert.throws(()=>preflightScoBatchState(calls(['read']),
    /** @type {any} */ (thenable),policy),
    /initial state must be synchronous/);
  assert.throws(()=>preflightScoBatchState(calls(['read']),
    /** @type {any} */ (Promise.resolve(true)),policy),
    /initial state must be synchronous/);
});

/** Ordinary synchronous object state remains valid, including across successive modeled steps. */
test('modeled batch retains synchronous object transitions and denies revoked state',()=>{
  /** @type {{
   * authorize:(state:{active:boolean},method:string,args:unknown[])=>boolean,
   * transition:(state:{active:boolean},method:string,args:unknown[])=>{active:boolean}
   * }} */
  const policy={
    authorize:(state,method,args)=>state.active && args.length===0 &&
      (method==='read'||method==='revoke'),
    transition:(state,method)=>method==='revoke'?{active:false}:state
  };
  assert.equal(preflightScoBatchState(calls(['read','revoke']),{active:true},policy),true);
  assert.equal(preflightScoBatchState(calls(['revoke','read']),{active:true},policy),false);
  assert.equal(preflightScoBatchState(calls(['read']),{active:false},policy),false);
});

test('HTTP SCO refuses async-transition batch before private side effects',async()=>{
  const http=require('node:http');
  const {createScoHandler,createScoBatchMethod}=require('../src');
  let effects=0;
  const methods={read:()=>++effects};
  const batch=createScoBatchMethod(methods);
  const statePolicy={
    authorize:/** @param {unknown} state */ state=>Boolean(state),
    transition:/** @type {any} */ (async()=>false)
  };
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{batch},
    authorizeRpc:()=>true,
    authorizeOperation:(request,method,args)=>method==='batch' &&
      args.length===1 && preflightScoBatchState(args[0],true,statePolicy)
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected TCP listener');
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/rpc',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({method:'batch',args:[calls(['read'])]})
    });
    assert.equal(response.status,500);
    assert.deepEqual(await response.json(),{ok:false,error:'Operation failed'});
    assert.equal(effects,0);
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
