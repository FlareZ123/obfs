'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const vm=require('node:vm');
const {createScoHandler,obfuscateFiles}=require('../src');

/** @param {number} port @param {string} host @param {boolean} [rpc] @param {string} [resource] @returns {Promise<{status:number,body:string}>} */
function request(port,host,rpc=false,resource='data.json') {
  return new Promise((resolve,reject)=>{
    const outgoing=http.request({
      hostname:'127.0.0.1',port,path:rpc?'/obfs/rpc':'/obfs/'+resource,
      method:rpc?'POST':'GET',
      headers:{host,'content-type':'application/json'}
    },response=>{
      /** @type {Buffer[]} */
      const chunks=[];
      response.on('data',part=>chunks.push(Buffer.from(part)));
      response.on('end',()=>resolve({status:response.statusCode??0,
        body:Buffer.concat(chunks).toString('utf8')}));
      response.on('error',reject);
    });
    outgoing.on('error',reject);
    outgoing.end(rpc?JSON.stringify({method:'read',args:[]}):undefined);
  });
}

test('SCO IPv6 Host-header routing recognizes bracketed addresses and denies malformed aliases',async()=>{
  const allowed=['[::1]'];
  const handler=createScoHandler([
    {path:'data.json',sourceType:'asset',code:'{"value":42}'},
    {path:'client.js',sourceType:'script',code:'globalThis.obfsIpv6Ready=42;'}
  ],{
    allowedHosts:allowed,
    remoteMethods:{read:()=>42},
    authorizeRpc:()=>true
  });
  // Published routing policy is an owned startup snapshot.
  allowed[0]='[::2]';
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const positive=['[::1]','[::1]:8080','[0:0:0:0:0:0:0:1]:65535'];
    for(const host of positive){
      assert.deepEqual(await request(address.port,host),{status:200,body:'{"value":42}'},host);
      const rpc=await request(address.port,host,true);
      assert.equal(rpc.status,200,host);
      assert.deepEqual(JSON.parse(rpc.body),{ok:true,value:42},host);
      const script=await request(address.port,host,false,'client.js');
      assert.equal(script.status,200,host+' obfuscated JS');
      const authorized={location:{hostname:'[::1]'}};
      vm.runInNewContext(script.body,authorized,{timeout:1000});
      assert.equal(/** @type {{obfsIpv6Ready?:number}} */ (authorized).obfsIpv6Ready,42,
        host+' authorized browser hostname');
      const denied={location:{hostname:'[::2]'}};
      assert.throws(()=>vm.runInNewContext(script.body,denied,{timeout:1000}),
        /Unauthorized execution host/,host+' unauthorized browser hostname');
      assert.equal(/** @type {{obfsIpv6Ready?:number}} */ (denied).obfsIpv6Ready,undefined);
    }
    const negative=['[::2]','[::1]evil','[::1]@evil.example',
      '[::1]:notaport','[::1]:99999','[::::]','evil.example','[::1]:8080@evil.example'];
    for(const host of negative){
      assert.equal((await request(address.port,host)).status,403,host);
      assert.equal((await request(address.port,host,true)).status,403,host+' RPC');
    }
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});


test('COO and SCO share strict canonical browser-host admission',()=>{
  const code='globalThis.ipv6Accepted=73;';
  const inputs=[{path:'client.js',sourceType:/** @type {const} */('script'),code}];
  const result=obfuscateFiles(inputs,{
    mode:'coo',seed:'ipv6-execution-guard',
    allowedHosts:['[0:0:0:0:0:0:0:1]','[::1]']
  });
  const compiled=String(result.files[0].code);
  const authorized={location:{hostname:'[::1]'}};
  vm.runInNewContext(compiled,authorized,{timeout:1000});
  assert.equal(/** @type {{ipv6Accepted?:number}} */(authorized).ipv6Accepted,73);
  for(const hostname of ['[::2]','evil.example','127.0.0.1']){
    const denied={location:{hostname}};
    assert.throws(()=>vm.runInNewContext(compiled,denied,{timeout:1000}),
      /Unauthorized execution host/,hostname);
    assert.equal(/** @type {{ipv6Accepted?:number}} */(denied).ipv6Accepted,undefined);
  }
  for(const invalid of ['[::::]','[::1]:8080','[::1]@evil.example',
    'https://[::1]','[2001:db8::zz]']){
    assert.throws(()=>obfuscateFiles(inputs,{mode:'coo',allowedHosts:[invalid]}),
      /allowedHosts must contain valid DNS names or bracketed IPv6 literals/,invalid);
    assert.throws(()=>createScoHandler([
      {path:'data.json',sourceType:'asset',code:'{}'}
    ],{allowedHosts:[invalid]}),
    /allowedHosts must contain valid DNS names or bracketed IPv6 literals/,invalid);
  }
});
