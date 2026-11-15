'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler,createScoBatchMethod}=require('../src');

/**
 * @typedef {{status:number,body:any}} RpcReply
 */

/**
 * @param {number} port
 * @param {string} method
 * @param {unknown[]} args
 * @returns {Promise<RpcReply>}
 */
async function invoke(port,method,args) {
  const response=await fetch('http://127.0.0.1:'+port+'/obfs/rpc',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({method,args})
  });
  return {status:response.status,body:await response.json()};
}

/**
 * A deliberately state-dependent policy: a caller is permitted to read only
 * until its session is revoked. A batch that revokes and then reads requires
 * operation-time authorization to enforce the same policy as serial calls.
 *
 * @param {boolean} excludeMutatingBatches
 * @returns {{server:import('node:http').Server,effects:string[],events:string[],state:{active:boolean}}}
 */
function fixture(excludeMutatingBatches) {
  const state={active:true};
  /** @type {string[]} */
  const effects=[];
  /** @type {string[]} */
  const events=[];
  const operations={
    revoke:()=>{
      effects.push('revoke');
      state.active=false;
      return 'revoked';
    },
    read:()=>{
      effects.push('read');
      return 'private-value';
    }
  };
  const batch=createScoBatchMethod(operations);
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{...operations,batch},
    authorizeRpc:()=>true,
    authorizeOperation:(request,method,args)=>{
      events.push('authorize:'+method);
      if(!state.active)return false;
      if(method!=='batch')return method==='revoke'||method==='read';
      if(args.length!==1||!Array.isArray(args[0]))return false;
      // Application-level mitigation: a batch that can invalidate its own
      // later permissions is rejected before ANY side effects occur.
      return !excludeMutatingBatches ||
        !args[0].some(call=>call?.method==='revoke');
    }
  }));
  return {server,effects,events,state};
}

/** @param {import('node:http').Server} server @returns {Promise<number>} */
async function start(server) {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Expected TCP listener');
  return address.port;
}

/** @param {import('node:http').Server} server @returns {Promise<void>} */
async function stop(server) {
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}

test('SCO batch preflight is a permission snapshot, not a per-step recheck',async()=>{
  const {server,effects,events,state}=fixture(false);
  const port=await start(server);
  try {
    const reply=await invoke(port,'batch',[[
      {method:'revoke',args:[]},
      {method:'read',args:[]}
    ]]);
    assert.deepEqual(reply,{status:200,body:{ok:true,value:[
      {ok:true,value:'revoked'},
      {ok:true,value:'private-value'}
    ]}});
    assert.deepEqual(events,['authorize:batch','authorize:revoke','authorize:read']);
    assert.deepEqual(effects,['revoke','read']);
    assert.equal(state.active,false);
    const after=await invoke(port,'read',[]);
    assert.deepEqual(after,{status:403,body:{ok:false,error:'Forbidden'}});
  }finally{
    await stop(server);
  }
});

test('SCO serial RPC rejects a read after its session has been revoked',async()=>{
  const {server,effects}=fixture(false);
  const port=await start(server);
  try {
    assert.deepEqual(await invoke(port,'revoke',[]),{
      status:200,body:{ok:true,value:'revoked'}
    });
    assert.deepEqual(await invoke(port,'read',[]),{
      status:403,body:{ok:false,error:'Forbidden'}
    });
    assert.deepEqual(effects,['revoke']);
  }finally{
    await stop(server);
  }
});

test('SCO batch-level state-transition policy rejects the whole unsafe batch',async()=>{
  const {server,effects,state}=fixture(true);
  const port=await start(server);
  try {
    assert.deepEqual(await invoke(port,'batch',[[
      {method:'revoke',args:[]},
      {method:'read',args:[]}
    ]]),{status:403,body:{ok:false,error:'Forbidden'}});
    assert.deepEqual(effects,[]);
    assert.equal(state.active,true);
    assert.deepEqual(await invoke(port,'read',[]),{
      status:200,body:{ok:true,value:'private-value'}
    });
    assert.deepEqual(effects,['read']);
  }finally{
    await stop(server);
  }
});
