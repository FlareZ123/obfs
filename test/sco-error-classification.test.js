'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {createScoHandler} = require('../src');

/**
 * @param {number} port
 * @param {string} contentType
 * @param {string} body
 * @returns {Promise<{status:number|undefined,body:string}>}
 */
function send(port,contentType,body) {
  return new Promise((resolve,reject)=>{
    const request=http.request({
      host:'127.0.0.1',port,path:'/obfs/rpc',method:'POST',
      headers:{'content-type':contentType}
    },response=>{
      let data='';
      response.on('data',chunk=>data+=chunk);
      response.on('end',()=>resolve({status:response.statusCode,body:data}));
      response.on('error',reject);
    });
    request.on('error',reject);
    request.end(body);
  });
}

test('SCO RPC does not expose private exception type through the HTTP status',async()=>{
  const secret='private-internal-exception-payload';
  const server=http.createServer(createScoHandler([
    {path:'client.js',code:'globalThis.ready=1;',sourceType:'script'}
  ],{
    remoteMethods:{
      syntactic:()=>{throw new SyntaxError(secret);},
      ordinary:()=>{throw new Error(secret);},
      good:()=>true
    },
    authorizeRpc:()=>true
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const addr=server.address();
    if(!addr||typeof addr==='string') throw new Error('Expected TCP server');
    const invalid=await send(addr.port,'application/json','{invalid');
    assert.equal(invalid.status,400);
    assert.deepEqual(JSON.parse(invalid.body),{ok:false,error:'Malformed JSON'});
    const wrongType=await send(addr.port,'application/jsonp',JSON.stringify({method:'good',args:[]}));
    assert.equal(wrongType.status,415);
    const valid=await send(addr.port,'APPLICATION/JSON; charset=utf-8',JSON.stringify({method:'good',args:[]}));
    assert.equal(valid.status,200,valid.body);
    assert.deepEqual(JSON.parse(valid.body),{ok:true,value:true});
    const failures=[];
    for(const method of ['syntactic','ordinary']) {
      const failed=await send(addr.port,'application/json',JSON.stringify({method,args:[]}));
      assert.equal(failed.status,500,failed.body);
      assert.ok(!failed.body.includes(secret));
      failures.push(failed.body);
    }
    assert.deepEqual(JSON.parse(failures[0]),{ok:false,error:'Operation failed'});
    assert.equal(failures[0],failures[1]);
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
