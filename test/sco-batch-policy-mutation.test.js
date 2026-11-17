'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler,createScoBatchMethod}=require('../src');

/**
 * @param {import('node:http').Server} server
 * @returns {Promise<number>}
 */
async function start(server) {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address || typeof address==='string')throw Error('Expected TCP listener');
  return address.port;
}

/** @param {import('node:http').Server} server @returns {Promise<void>} */
async function stop(server) {
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}

/**
 * @param {number} port
 * @param {unknown[]} calls
 * @returns {Promise<{status:number,body:any}>}
 */
async function send(port,calls) {
  const response=await fetch('http://127.0.0.1:'+port+'/obfs/rpc',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({method:'batch',args:[calls]})
  });
  return {status:response.status,body:await response.json()};
}

test('SCO batch executes only checked methods even when authorization mutates earlier calls',async()=>{
  /** @type {string[]} */
  const effects=[];
  /** @type {{method:string,args:unknown[]}[]|null} */
  let suppliedCalls=null;
  const methods={
    /** @param {number} value */
    read:value=>{effects.push('read:'+value);return value;},
    /** @param {number} value */
    forbidden:value=>{effects.push('forbidden:'+value);return value;}
  };
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{batch:createScoBatchMethod(methods)},
    authorizeRpc:()=>true,
    authorizeOperation:(request,method,args)=>{
      if(method==='batch'){
        suppliedCalls=/** @type {{method:string,args:unknown[]}[]} */ (args[0]);
        return true;
      }
      if(method!=='read')return false;
      if(args[0]===2 && suppliedCalls) {
        // Application policy accidentally rewrites a previous call while
        // checking the final allowed item. Unchecked server work must not run.
        suppliedCalls[0].method='forbidden';
        suppliedCalls[0].args=[99];
      }
      return args[0]===1 || args[0]===2;
    }
  }));
  const port=await start(server);
  try{
    const result=await send(port,[
      {method:'read',args:[1]},{method:'read',args:[2]}
    ]);
    assert.deepEqual(result,{status:200,body:{ok:true,value:[
      {ok:true,value:1},{ok:true,value:2}
    ]}});
    assert.deepEqual(effects,['read:1','read:2'],
      'Authorization callback must not swap a checked operation for an unchecked one');
  } finally {
    await stop(server);
  }
});

test('SCO batch retains the submitted argument values when policy mutates another call',async()=>{
  /** @type {number[]} */
  const effects=[];
  /** @type {{method:string,args:unknown[]}[]|null} */
  let suppliedCalls=null;
  const methods={
    /** @param {number} value */
    charge:value=>{effects.push(value);return value*10;}
  };
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{batch:createScoBatchMethod(methods)},
    authorizeRpc:()=>true,
    authorizeOperation:(request,method,args)=>{
      if(method==='batch'){
        suppliedCalls=/** @type {{method:string,args:unknown[]}[]} */ (args[0]);
        return true;
      }
      if(method==='charge' && args[0]===2 && suppliedCalls) {
        suppliedCalls[0].args[0]=99;
      }
      return method==='charge' && (args[0]===1 || args[0]===2);
    }
  }));
  const port=await start(server);
  try {
    const result=await send(port,[
      {method:'charge',args:[1]},{method:'charge',args:[2]}
    ]);
    assert.deepEqual(result,{status:200,body:{ok:true,value:[
      {ok:true,value:10},{ok:true,value:20}
    ]}});
    assert.deepEqual(effects,[1,2]);
  } finally {
    await stop(server);
  }
});
