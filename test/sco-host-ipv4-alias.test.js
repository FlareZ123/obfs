'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const vm=require('node:vm');
const {canonicalAllowedHosts,routingHostname}=require('../src/hosts');
const {createScoHandler,obfuscateFiles}=require('../src');

/**
 * Exercise real HTTP routing separately from the browser's location.hostname
 * guard. The Host header is requester-controlled and never authenticates.
 * @param {number} port
 * @param {string} host
 * @returns {Promise<{status:number,body:string}>}
 */
function request(port,host) {
  return new Promise((resolve,reject)=>{
    const outgoing=http.request({
      hostname:'127.0.0.1',port,path:'/obfs/status.json',
      headers:{host}
    },response=>{
      /** @type {Buffer[]} */
      const parts=[];
      response.on('data',part=>parts.push(Buffer.from(part)));
      response.on('end',()=>resolve({
        status:response.statusCode??0,
        body:Buffer.concat(parts).toString('utf8')
      }));
      response.on('error',reject);
    });
    outgoing.on('error',reject);
    outgoing.end();
  });
}

test('ASCII IPv4 host aliases match WHATWG browser hostname normalization',()=>{
  assert.deepEqual(canonicalAllowedHosts([
    '127.1','127.0.0.1','0x7f000001',
    '1.2.3.004','1.2.3.4','ExAmPlE.cOm'
  ]),['127.0.0.1','1.2.3.4','example.com']);
  for(const host of ['127.1','127.0.0.1','0x7f000001','127.1:8080']) {
    assert.equal(routingHostname(host),'127.0.0.1',host);
  }
  assert.equal(routingHostname('1.2.3.004:443'),'1.2.3.4');
  assert.equal(routingHostname('ExAmPlE.cOm:443'),'example.com');
  for(const malformed of [
    '127.1:65536','127.1:invalid','127.1@evil.example',
    '127.1:80@evil.example','127.1/extra','127.1:80:90',
    '1.2.3.999'
  ]) {
    assert.equal(routingHostname(malformed),null,malformed);
  }
  for(const malformed of ['1.2.3.999','127.1:8080','[::::]']) {
    assert.throws(()=>canonicalAllowedHosts([malformed]),
      /allowedHosts must contain valid DNS names or bracketed IPv6 literals/,
      malformed);
  }
});

test('COO browser guard uses the normalized configured IPv4 hostname',()=>{
  const source=[{
    path:'client.js',sourceType:/** @type {const} */ ('script'),
    code:'globalThis.ipv4Accepted=73;'
  }];
  const output=obfuscateFiles(source,{
    mode:'coo',seed:'whatwg-ipv4-normalization-20261122',
    allowedHosts:['127.1','1.2.3.004']
  });
  const script=String(output.files[0].code);
  for(const hostname of ['127.0.0.1','1.2.3.4']) {
    const context={location:{hostname}};
    vm.runInNewContext(script,context,{timeout:1000});
    assert.equal(/** @type {{ipv4Accepted?:number}} */ (context).ipv4Accepted,73,
      hostname+' should execute in the allowed browser environment');
  }
  const context={location:{hostname:'127.0.0.2'}};
  assert.throws(()=>vm.runInNewContext(script,context,{timeout:1000}),
    /Unauthorized execution host/);
  assert.equal(/** @type {{ipv4Accepted?:number}} */ (context).ipv4Accepted,
    undefined);
});

test('SCO routing normalizes IPv4 Host aliases without trusting the header',async()=>{
  const server=http.createServer(createScoHandler([
    {path:'status.json',sourceType:'asset',code:'{"ok":true}'}
  ],{allowedHosts:['127.1']}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    for(const host of ['127.1','127.0.0.1','0x7f000001:8080']) {
      assert.deepEqual(await request(address.port,host),
        {status:200,body:'{"ok":true}'},host);
    }
    for(const host of [
      '127.0.0.2','127.1:invalid','127.1@evil.example',
      '127.1:65536','127.1:8080@evil.example'
    ]) {
      assert.equal((await request(address.port,host)).status,403,host);
    }
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
  }
});
