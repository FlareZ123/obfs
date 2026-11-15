'use strict';

const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const {test}=require('node:test');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {startServer}=require('../examples/sco-private/server.cjs');
const {atomicWrite}=require('../src/atomic');
const {compileExample,buildSample}=require('../examples/sco-private/build-sample.cjs');

test('checked-in SCO before/after sample equals real compiler output and executes over authenticated RPC',async()=>{
  const sourceRoot=path.join(__dirname,'..','examples','sco-private');
  const beforePath=path.join(sourceRoot,'before-private.mjs');
  const afterPath=path.join(sourceRoot,'after-public.mjs');
  const before=await fs.readFile(beforePath,'utf8');
  const after=await fs.readFile(afterPath,'utf8');
  const generated=await compileExample();
  await buildSample(true);
  assert.equal(generated.client,after);
  assert.match(before,/createHmac/u);
  assert.match(before,/OBFS_SCO_DEMO_KEY/u);
  assert.ok(!after.includes('createHmac'));
  assert.ok(!after.includes('OBFS_SCO_DEMO_KEY'));
  assert.ok(!after.includes('15000'));
  const originalKey=process.env.OBFS_SCO_DEMO_KEY;
  const key=randomBytes(32).toString('hex');
  const password='this-is-a-test-password-not-for-deployment';
  const authorization='Basic '+Buffer.from('demo:'+password).toString('base64');
  const nativeFetch=globalThis.fetch;
  const tempDirectory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-real-served-'));
  process.env.OBFS_SCO_DEMO_KEY=key;
  /** @type {Awaited<ReturnType<typeof startServer>>|null} */
  let hosted=null;
  try {
    hosted=await startServer({port:0,password});
    const origin=hosted.origin;
    const deniedPublic=await nativeFetch(origin+'/obfs/public.mjs');
    const deniedRpc=await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:hosted.partition.methodNames.derive,
        args:['0123456789abcdef0123456789abcdef']})
    });
    assert.equal(deniedPublic.status,403);
    assert.equal(deniedRpc.status,403);
    const deniedHome=await nativeFetch(origin+'/');
    assert.equal(deniedHome.status,401);
    assert.match(deniedHome.headers.get('www-authenticate')??'',/Basic/u);
    const headers={Authorization:authorization};
    const forbiddenPrivate=await nativeFetch(origin+'/obfs/before-private.mjs',{headers});
    assert.equal(forbiddenPrivate.status,404);
    const publicResponse=await nativeFetch(origin+'/obfs/public.mjs',{headers});
    assert.equal(publicResponse.status,200);
    const servedCode=await publicResponse.text();
    assert.match(servedCode,/export async function derive/u);
    assert.ok(!servedCode.includes('createHmac'));
    assert.ok(!servedCode.includes('OBFS_SCO_DEMO_KEY'));
    const servedFile=path.join(tempDirectory,'served.mjs');
    await atomicWrite(servedFile,servedCode);
    globalThis.fetch=(url,options)=>{
      const requestHeaders=new Headers(options?.headers);
      requestHeaders.set('Authorization',authorization);
      return nativeFetch(new URL(String(url),origin),{...options,headers:requestHeaders});
    };
    const facade=/** @type {{derive:(value:string)=>Promise<string>}} */
      (await import(pathToFileURL(servedFile).href));
    const original=/** @type {{derive:(value:string)=>Promise<string>}} */
      (await import(pathToFileURL(beforePath).href));
    for(const input of ['0'.repeat(32),'0123456789abcdef0123456789abcdef']) {
      const nativeValue=await original.derive(input);
      const overNetwork=await facade.derive(input);
      assert.equal(overNetwork,nativeValue);
      assert.match(overNetwork,/^[0-9a-f]{64}$/u);
    }
  }finally{
    globalThis.fetch=nativeFetch;
    if(hosted) {
      const server=hosted.server;
      /** @type {Promise<void>} */
      const closed=new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve()));
      await closed;
    }
    await fs.rm(tempDirectory,{recursive:true,force:true});
    if(originalKey===undefined)delete process.env.OBFS_SCO_DEMO_KEY;
    else process.env.OBFS_SCO_DEMO_KEY=originalKey;
  }
});
