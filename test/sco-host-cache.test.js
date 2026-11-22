'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const {createRoutingHostResolver}=require('../src/hosts');
const {createScoHandler}=require('../src');

/**
 * Use a real HTTP request. Routing policy and authorizeRead are separate,
 * including when a previously normalized Host has been cached.
 * @param {number} port
 * @param {string} host
 * @returns {Promise<{status:number,body:string}>}
 */
function request(port,host) {
  return new Promise((resolve,reject)=>{
    const outgoing=http.request({
      hostname:'127.0.0.1',port,path:'/obfs/status.json',headers:{host}
    },response=>{
      /** @type {Buffer[]} */
      const chunks=[];
      response.on('data',chunk=>chunks.push(Buffer.from(chunk)));
      response.on('end',()=>resolve({
        status:response.statusCode??0,
        body:Buffer.concat(chunks).toString('utf8')
      }));
      response.on('error',reject);
    });
    outgoing.on('error',reject);
    outgoing.end();
  });
}

test('cached SCO routing accepts exact equivalent hosts and refuses malformed values',()=>{
  const allowed=new Set(['127.0.0.1','example.com']);
  const admit=createRoutingHostResolver(allowed);
  for(const host of ['127.1:8080','127.0.0.1','0x7f000001',
    'example.com:443','EXAMPLE.COM:443']) {
    assert.equal(admit(host),true,host);
    assert.equal(admit(host),true,'repeat '+host);
  }
  for(const host of ['127.0.0.2:8080','example.org:443',
    'example.com:65536','example.com:abc','127.1@evil.example',
    '127.1:8080@evil.example','1.2.3.999']) {
    assert.equal(admit(host),false,host);
    assert.equal(admit(host),false,'repeat denied '+host);
  }
  // Mutating the supplied Set after creation must not widen permission.
  allowed.add('evil.example');
  allowed.delete('127.0.0.1');
  assert.equal(admit('evil.example'),false);
  assert.equal(admit('127.0.0.1'),true);
});

test('bounded positive Host cache survives 256 raw spellings and eviction',()=>{
  const admit=createRoutingHostResolver(new Set(['127.0.0.1']));
  for(let port=1000;port<1256;port++) {
    assert.equal(admit('127.1:'+port),true,'unique port '+port);
  }
  assert.equal(admit('127.1:1000'),true,'evicted value reparses safely');
  assert.equal(admit('127.1:1255'),true,'recent value remains valid');
  for(let port=1000;port<1256;port++) {
    assert.equal(admit('127.0.0.2:'+port),false,'rejected unique '+port);
  }
});

test('repeated accepted Host never bypasses per-request SCO read authorization',async()=>{
  let checks=0;
  const handler=createScoHandler([
    {path:'status.json',sourceType:'asset',code:'{"value":42}'}
  ],{
    allowedHosts:['127.1'],
    authorizeRead:()=>{checks++;return checks!==2;}
  });
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    assert.ok(address && typeof address==='object');
    const first=await request(address.port,'127.1:8080');
    const second=await request(address.port,'127.1:8080');
    const third=await request(address.port,'127.1:8080');
    assert.deepEqual([first.status,second.status,third.status],
      [200,403,200]);
    assert.equal(checks,3,'authorizeRead remains active on every read');
    assert.equal(first.body,'{"value":42}');
    assert.equal(third.body,'{"value":42}');
    assert.equal((await request(address.port,'127.0.0.2')).status,403);
    assert.equal(checks,3,'denied Host does not reach read policy');
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
  }
});
