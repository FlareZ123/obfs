'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {parse}=require('../src/ast');
const {atomicWrite}=require('../src/atomic');
const {createScoHandler,createScoRpcClientSource}=require('../src');

const runFile=promisify(execFile);

test('SCO client source restricts endpoints and preserves special own method names',()=>{
  assert.throws(()=>createScoRpcClientSource([]),/nonempty/);
  assert.throws(()=>createScoRpcClientSource(['same','same']),/unique/);
  assert.throws(()=>createScoRpcClientSource(['valid'],{endpoint:'//attacker.test/rpc'}),/same-origin/);
  assert.throws(()=>createScoRpcClientSource(['valid'],{endpoint:'https://attacker.test/rpc'}),/same-origin/);
  assert.throws(()=>createScoRpcClientSource(['valid'],{endpoint:'/\\attacker.test/rpc'}),/same-origin/);
  const moduleSource=createScoRpcClientSource(['combine','__proto__','toString'],{endpoint:'/private/rpc'});
  assert.ok(moduleSource.includes('/private/rpc'));
  assert.doesNotThrow(()=>parse(moduleSource,'module'));
});

test('generated SCO ESM facade calls authenticated server-only RPC without shipping implementation',async()=>{
  const secret='server-resident-canary-9276';
  const clientSource=createScoRpcClientSource(['combine','broken']);
  assert.ok(!clientSource.includes(secret));
  const server=http.createServer(createScoHandler([
    {path:'rpc-client.mjs',sourceType:'module',code:clientSource}
  ],{
    remoteMethods:{
      /** @param {string} value */
      combine:value=>value+':'+secret,
      broken:()=>{throw new Error(secret);}
    },
    authorizeRead:request=>request.headers.cookie==='session=allow',
    authorizeRpc:request=>request.headers.cookie==='session=allow'
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-rpc-client-'));
  try {
    const address=server.address();
    if (!address || typeof address==='string') throw new Error('Expected a TCP listener');
    const port=address.port;
    const url='http://127.0.0.1:'+port+'/obfs/rpc-client.mjs';
    const unauthorized=await fetch(url);
    assert.equal(unauthorized.status,403);
    const authorized=await fetch(url,{headers:{cookie:'session=allow'}});
    assert.equal(authorized.status,200);
    const served=await authorized.text();
    assert.ok(!served.includes(secret));
    assert.doesNotThrow(()=>parse(served,'module'));
    const clientPath=path.join(temporary,'rpc-client.mjs');
    await atomicWrite(clientPath,served);

    // Node's fetch expects an absolute URL; the shim supplies the server
    // origin used automatically by a browser's same-origin URL resolution.
    const runner=
      "const {pathToFileURL}=require('node:url');" +
      "const originalFetch=globalThis.fetch;" +
      `globalThis.fetch=(endpoint,options)=>originalFetch(new URL(endpoint,'http://127.0.0.1:${port}'),{...options,headers:{...options.headers,...(process.argv[2]==='allow'?{cookie:'session=allow'}:{})}});` +
      "import(pathToFileURL(process.argv[1]).href).then(async loaded=>{try{" +
      "const value=await loaded.default[process.argv[3]]('input');" +
      "process.stdout.write(JSON.stringify({ok:true,value}));" +
      "}catch(error){process.stdout.write(JSON.stringify({ok:false,error:error.message}));}" +
      "}).catch(error=>{console.error(error);process.exitCode=1;});";

    /** @param {'allow'|'deny'} session @param {'combine'|'broken'} method */
    async function call(session,method) {
      const executed=await runFile(process.execPath,['--eval',runner,clientPath,session,method],{
        encoding:'utf8',timeout:15000
      });
      return JSON.parse(executed.stdout);
    }

    assert.deepEqual(await call('allow','combine'),{ok:true,value:'input:'+secret});
    assert.deepEqual(await call('deny','combine'),{ok:false,error:'Remote operation failed'});
    assert.deepEqual(await call('allow','broken'),{ok:false,error:'Remote operation failed'});
  } finally {
    await fs.rm(temporary,{recursive:true,force:true});
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
