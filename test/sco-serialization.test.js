'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {createScoHandler} = require('../src');

/**
 * Send a real JSON RPC request through Node's HTTP server.
 * @param {number} port
 * @param {string} method
 * @returns {Promise<{status:number|undefined,body:string}>}
 */
function rpc(port,method) {
  return new Promise((resolve,reject)=>{
    const request=http.request({
      host:'127.0.0.1',port,path:'/obfs/rpc',method:'POST',
      headers:{'content-type':'application/json'}
    },response=>{
      /** @type {Buffer[]} */
      const chunks=[];
      response.on('data',chunk=>chunks.push(Buffer.from(chunk)));
      response.on('end',()=>resolve({
        status:response.statusCode,body:Buffer.concat(chunks).toString('utf8')
      }));
      response.on('error',reject);
    });
    request.on('error',reject);
    request.end(JSON.stringify({method,args:[]}));
  });
}

test('SCO RPC serialization failures return a generic error and preserve the server',async()=>{
  /** @type {{self?:unknown}} */
  const circular={};
  circular.self=circular;
  const server=http.createServer(createScoHandler([
    {path:'client.js',code:'globalThis.value=1;',sourceType:'script'}
  ],{
    remoteMethods:{big:()=>123n,circular:()=>circular,good:()=>42},
    authorizeRpc:()=>true
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if (!address || typeof address==='string') throw new Error('Expected a bound TCP server');
    for (const method of ['big','circular']) {
      const response=await rpc(address.port,method);
      assert.equal(response.status,500,method+': '+response.body);
      assert.deepEqual(JSON.parse(response.body),{ok:false,error:'Operation failed'});
    }
    const good=await rpc(address.port,'good');
    assert.equal(good.status,200,good.body);
    assert.deepEqual(JSON.parse(good.body),{ok:true,value:42});
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
