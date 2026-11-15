'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler}=require('../src');

/**
 * Send a raw HTTP target accepted by Node's HTTP parser, including targets
 * which cannot be interpreted as valid WHATWG absolute URLs.
 * @param {number} port
 * @param {string} target
 * @returns {Promise<{status:number,body:string}>}
 */
function request(port,target) {
  return new Promise((resolve,reject)=>{
    const call=http.request({
      hostname:'127.0.0.1',port,path:target,method:'GET'
    },response=>{
      const chunks=[];
      response.on('data',chunk=>chunks.push(chunk));
      response.on('end',()=>resolve({
        status:response.statusCode??0,
        body:Buffer.concat(chunks).toString('utf8')
      }));
      response.on('error',reject);
    });
    call.on('error',reject);
    call.end();
  });
}

test('SCO rejects malformed absolute-form request targets and remains available',async()=>{
  const server=http.createServer(createScoHandler([
    {path:'entry.js',sourceType:'script',code:'globalThis.ready=true;'}
  ]));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Expected listener');
    const bad=await request(address.port,'http://[');
    assert.deepEqual(bad,{status:400,body:''});
    const good=await request(address.port,'/obfs/entry.js');
    assert.equal(good.status,200);
    assert.match(good.body,/ready/);
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
