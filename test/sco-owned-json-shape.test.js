'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler,createScoBatchMethod,preflightScoBatchState}=require('../src');

/** @param {import('node:http').Server} server @returns {Promise<number>} */
async function listen(server) {
  /** @type {Promise<void>} */
  const started=new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await started;
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Expected TCP listener');
  return address.port;
}

/** @param {import('node:http').Server} server @returns {Promise<void>} */
async function close(server) {
  /** @type {Promise<void>} */
  const closed=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await closed;
}

/** @param {number} port @param {string} body @returns {Promise<{status:number,payload:any}>} */
async function send(port,body) {
  return new Promise((resolve,reject)=>{
    const request=http.request({
      hostname:'127.0.0.1',port,path:'/obfs/rpc',method:'POST',
      headers:{'content-type':'application/json','content-length':Buffer.byteLength(body)}
    },response=>{
      let raw='';
      response.setEncoding('utf8');
      response.on('data',chunk=>{raw+=chunk;});
      response.on('error',reject);
      response.on('end',()=>resolve({status:response.statusCode||0,payload:JSON.parse(raw)}));
    });
    request.on('error',reject);
    request.end(body);
  });
}

/**
 * Temporarily model a trusted server dependency that has polluted the common
 * prototype. Parsed JSON records still inherit Object.prototype.
 * @template T
 * @param {'method'|'args'} key
 * @param {unknown} value
 * @param {()=>Promise<T>|T} run
 * @returns {Promise<T>}
 */
async function withInherited(key,value,run) {
  const old=Object.getOwnPropertyDescriptor(Object.prototype,key);
  Object.defineProperty(Object.prototype,key,{value,writable:true,configurable:true});
  try{return await run();}
  finally {
    if(old)Object.defineProperty(Object.prototype,key,old);
    else Reflect.deleteProperty(Object.prototype,key);
  }
}

test('SCO RPC requires an own method key even when a host prototype names a registered method',async()=>{
  /** @type {number[]} */
  const effects=[];
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{read:/** @param {number} value */ value=>{effects.push(value);return value*2;}},
    authorizeRpc:()=>true
  }));
  const port=await listen(server);
  try{
    await withInherited('method','read',async()=>{
      assert.deepEqual(await send(port,'{"args":[5]}'),{
        status:400,payload:{ok:false,error:'Unknown method or invalid arguments'}
      });
    });
    assert.deepEqual(effects,[]);
    assert.deepEqual(await send(port,'{"method":"read","args":[5]}'),{
      status:200,payload:{ok:true,value:10}
    });
    assert.deepEqual(effects,[5]);
  }finally{await close(server);}
});

test('SCO RPC requires an own argument array despite an inherited host default',async()=>{
  /** @type {number[]} */
  const effects=[];
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{read:/** @param {number} value */ value=>{effects.push(value);return value;}},
    authorizeRpc:()=>true
  }));
  const port=await listen(server);
  try{
    await withInherited('args',[5],async()=>{
      assert.deepEqual(await send(port,'{"method":"read"}'),{
        status:400,payload:{ok:false,error:'Unknown method or invalid arguments'}
      });
    });
    assert.deepEqual(effects,[]);
  }finally{await close(server);}
});

test('Recognized SCO batches reject member method inherited from a host prototype',async()=>{
  /** @type {number[]} */
  const effects=[];
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{batch:createScoBatchMethod({
      read:/** @param {number} value */ value=>{effects.push(value);return value;}
    })},
    authorizeRpc:()=>true,
    authorizeOperation:()=>true
  }));
  const port=await listen(server);
  try{
    await withInherited('method','read',async()=>{
      assert.deepEqual(await send(port,'{"method":"batch","args":[[{"args":[5]}]]}'),{
        status:500,payload:{ok:false,error:'Operation failed'}
      });
    });
    assert.deepEqual(effects,[]);
    assert.deepEqual(await send(port,'{"method":"batch","args":[[{"method":"read","args":[5]}]]}'),{
      status:200,payload:{ok:true,value:[{ok:true,value:5}]}
    });
  }finally{await close(server);}
});

test('Pure SCO batch model rejects inherited operation keys',async()=>{
  const policy={
    /** @param {boolean} state @param {string} method */
    authorize:(state,method)=>state&&method==='read',
    /** @param {boolean} state */
    transition:state=>state
  };
  await withInherited('method','read',()=>{
    const missing=JSON.parse('[{"args":[]}]');
    assert.equal(preflightScoBatchState(missing,true,policy),false);
    const own=JSON.parse('[{"method":"read","args":[]}]');
    assert.equal(preflightScoBatchState(own,true,policy),true);
  });
});
