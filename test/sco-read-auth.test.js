'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const vm = require('node:vm');
const {createScoHandler} = require('../src');

/**
 * Perform one HTTP request using the real listener.
 * @param {number} port
 * @param {string} method
 * @param {string} target
 * @param {string} session
 * @returns {Promise<{status:number|undefined,body:Buffer,headers:http.IncomingHttpHeaders}>}
 */
function request(port,method,target,session) {
  return new Promise((resolve,reject)=>{
    const outgoing=http.request({
      host:'127.0.0.1',port,path:target,method,
      headers:{'x-session':session,'content-type':'application/json'}
    },response=>{
      /** @type {Buffer[]} */
      const buffers=[];
      response.on('data',part=>buffers.push(Buffer.from(part)));
      response.on('end',()=>resolve({
        status:response.statusCode,body:Buffer.concat(buffers),headers:response.headers
      }));
      response.on('error',reject);
    });
    outgoing.on('error',reject);
    outgoing.end(method==='POST'?JSON.stringify({method:'fixed',args:[]}):undefined);
  });
}

test('SCO read authorization protects both source code and static assets',async()=>{
  const events=[];
  const handler=createScoHandler([
    {path:'client.js',code:'globalThis.payload="runtime-value";',sourceType:'script'},
    {path:'data.bin',code:Buffer.from([1,2,3]),sourceType:'asset'}
  ],{
    /** @param {http.IncomingMessage} req */
    authorizeRead:async req=>{
      events.push(req.url);
      if(req.headers['x-session']==='error') throw new Error('private-auth-check');
      return req.headers['x-session']==='approved';
    },
    remoteMethods:{fixed:()=>7},
    authorizeRpc:()=>true
  });
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if (!address || typeof address==='string') throw new Error('Expected a bound server');
    const port=address.port;
    for(const target of ['/obfs/client.js','/obfs/data.bin']) {
      const denied=await request(port,'GET',target,'missing');
      assert.equal(denied.status,403);
      assert.equal(denied.body.length,0);
      assert.equal(denied.headers['cache-control'],'no-store');
    }
    const failed=await request(port,'GET','/obfs/client.js','error');
    assert.equal(failed.status,500);
    assert.ok(!failed.body.toString().includes('private-auth-check'));
    const script=await request(port,'GET','/obfs/client.js','approved');
    assert.equal(script.status,200);
    const context={};
    vm.runInNewContext(script.body.toString('utf8'),context);
    assert.equal(context.payload,'runtime-value');
    const binary=await request(port,'GET','/obfs/data.bin','approved');
    assert.equal(binary.status,200);
    assert.deepEqual(binary.body,Buffer.from([1,2,3]));
    const rpc=await request(port,'POST','/obfs/rpc','missing');
    assert.equal(rpc.status,200,'RPC authorization must remain independent');
    assert.deepEqual(JSON.parse(rpc.body.toString()),{ok:true,value:7});
    assert.equal(events.length,5,'Source/asset reads should all pass the read gate');
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
