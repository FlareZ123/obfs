'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler}=require('../src');

/** @param {import('node:http').Server} server @returns {Promise<number>} */
async function listen(server) {
  /** @type {Promise<void>} */
  const started=new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await started;
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Expected listener');
  return address.port;
}

/** @param {import('node:http').Server} server @returns {Promise<void>} */
async function stop(server) {
  /** @type {Promise<void>} */
  const closed=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await closed;
}

/**
 * Submit exact wire text. JSON.stringify on the client would itself invoke
 * the polluted inherited toJSON function, obscuring the server-side proof.
 * @param {number} port
 * @param {string} body
 * @returns {Promise<{status:number,body:string}>}
 */
function post(port,body) {
  return new Promise((resolve,reject)=>{
    const request=http.request({
      hostname:'127.0.0.1',port,path:'/obfs/rpc',method:'POST',
      headers:{'content-type':'application/json','content-length':Buffer.byteLength(body)}
    },response=>{
      let result='';
      response.setEncoding('utf8');
      response.on('data',chunk=>{result+=chunk;});
      response.on('error',reject);
      response.on('end',()=>resolve({status:response.statusCode||0,body:result}));
    });
    request.on('error',reject);
    request.end(body);
  });
}

/**
 * Control for an unrelated trusted dependency that adds a toJSON hook to
 * Object.prototype. The private method return in this test is primitive,
 * keeping the observable transport envelope separate from application
 * serialization of arbitrary private object results.
 *
 * @template T
 * @param {()=>Promise<T>} run
 * @returns {Promise<T>}
 */
async function withInheritedToJSON(run) {
  const old=Object.getOwnPropertyDescriptor(Object.prototype,'toJSON');
  Object.defineProperty(Object.prototype,'toJSON',{
    configurable:true,writable:true,
    value:function(){
      return 'ATTACKER_SUPPLIED_ENVELOPE';
    }
  });
  try{return await run();}
  finally{
    if(old)Object.defineProperty(Object.prototype,'toJSON',old);
    else Reflect.deleteProperty(Object.prototype,'toJSON');
  }
}

test('SCO JSON response envelope resists inherited toJSON for success and denial',async()=>{
  let runs=0;
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{value:()=>{runs++;return 17;}},
    authorizeRpc:request=>request.headers['x-deny']!=='1',
    authorizeOperation:(request,method)=>method==='value'
  }));
  const port=await listen(server);
  try{
    const expected=await post(port,'{"method":"value","args":[]}');
    assert.deepEqual(expected,{status:200,body:'{"ok":true,"value":17}'});
    await withInheritedToJSON(async()=>{
      assert.deepEqual(await post(port,'{"method":"value","args":[]}'),expected);
      assert.deepEqual(await post(port,'{"method":"unknown","args":[]}'),{
        status:400,body:'{"ok":false,"error":"Unknown method or invalid arguments"}'
      });
      assert.deepEqual(await post(port,'{invalid'),{
        status:400,body:'{"ok":false,"error":"Malformed JSON"}'
      });
      // No inherited toJSON implementation may suppress the protocol
      // envelope or fabricate a private result.
      assert.equal(runs,2);
    });
  }finally{await stop(server);}
});
