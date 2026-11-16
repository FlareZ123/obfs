'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');

const ROOT=path.join(__dirname,'../examples/sco-private-graph');
const SEED='sco-private-graph-20261116';
const SPECIFIER='./private/engine.mjs';

/**
 * @param {string} code
 * @param {import('../src/sco-selective-partition').ScoSelectiveOptions} [options]
 */
function partition(code,options={}){
  return partitionScoSelectedAsyncExports({path:'mixed.mjs',sourceType:'module',code},{
    seed:SEED,privateNames:['protectedDigest'],...options
  });
}

test('SCO private ESM graph imports require explicit canonical allowlisting',async()=>{
  const source=await fs.readFile(path.join(ROOT,'before/mixed.mjs'),'utf8');
  assert.throws(()=>partition(source),/explicitly enabled named Node builtin imports/);
  assert.throws(()=>partition(source,{privateModuleImports:['./private/other.mjs']}),
    /explicitly enabled named Node builtin imports/);
  for(const specifier of [
    '../private/engine.mjs','./private/../engine.mjs','./private//engine.mjs',
    './private/%2e%2e/engine.mjs','./private/engine.mjs?version=2',
    './private/engine.mjs#variant','./private/engine.js','/absolute.mjs',
    'https://example.invalid/private.mjs','node:crypto','././private/engine.mjs',
    './private/CON.mjs','./private/engine.mjs/'
  ]){
    assert.throws(()=>partition(source,{privateModuleImports:[specifier]}),
      /canonical relative \.mjs path/,specifier);
  }
  assert.throws(()=>partition(source,{privateModuleImports:[SPECIFIER,SPECIFIER]}),
    /distinct privateNames/);
  assert.throws(()=>partition(source,{privateModuleImports:'./private/engine.mjs'}),
    /distinct privateNames/);
  const generated=partition(source,{privateModuleImports:[SPECIFIER]});
  assert.deepEqual(generated.privateNames,['protectedDigest']);
  assert.deepEqual(generated.publicNames,['format','combined']);
});

test('SCO private module import never enters retained public functions or public helpers',()=>{
  const head='import {deriveProof} from "./private/engine.mjs";';
  const secret='export async function protectedDigest(value){return deriveProof(value);}';
  const local='export function format(value){return deriveProof(value);}';
  assert.throws(()=>partition(head+secret+local,{privateModuleImports:[SPECIFIER]}),
    /server-only constant: format/);
  const helper='function helper(value){return deriveProof(value);}';
  assert.throws(()=>partition(head+helper+secret+
    'export function format(value){return value;}',{
    privateModuleImports:[SPECIFIER],publicHelperNames:['helper']
  }),/server-only constant: helper/);
});

test('SCO private local module graph runs natively and through authenticated generated RPC',{
  timeout:60000
},async()=>{
  const source=(await fs.readFile(path.join(ROOT,'before/mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const privateSource=(await fs.readFile(path.join(ROOT,'before/private/engine.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const golden=(await fs.readFile(path.join(ROOT,'after/mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const generated=partition(source,{privateModuleImports:[SPECIFIER]});
  assert.equal(generated.clientFile.code,golden,'Byte-exact public ESM facade drifted');
  assert.doesNotMatch(golden,/node:crypto|deriveProof|PRIVATE_SECRET|SCO_PRIVATE_MODULE_GRAPH_KEY/u);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-esm-graph-'));
  const nativeFetch=globalThis.fetch;
  /** @type {import('node:http').Server|undefined} */
  let server;
  try{
    await atomicWrite(path.join(dir,'mixed.mjs'),source);
    await atomicWrite(path.join(dir,'private','engine.mjs'),privateSource);
    await atomicWrite(path.join(dir,'client.mjs'),golden);
    const native=await import(pathToFileURL(path.join(dir,'mixed.mjs')).href);
    const registry=bindScoModuleExports(generated,native);
    server=http.createServer(createScoHandler([generated.clientFile],{
      remoteMethods:registry,
      authorizeRead:req=>req.headers['x-test-session']==='allow',
      authorizeRpc:req=>req.headers['x-test-session']==='allow',
      authorizeOperation:(req,method,args)=>
        req.headers['x-test-session']==='allow' &&
        method===generated.methodNames.protectedDigest &&
        args.length===1&&typeof args[0]==='string'&&args[0].length<=2048
    }));
    /** @type {Promise<void>} */
    const listening=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
    await listening;
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    assert.equal((await nativeFetch(origin+'/obfs/mixed.mjs')).status,403);
    assert.equal((await nativeFetch(origin+'/obfs/private/engine.mjs',{
      headers:{'x-test-session':'allow'}
    })).status,404);
    const delivered=await nativeFetch(origin+'/obfs/mixed.mjs',{
      headers:{'x-test-session':'allow'}
    });
    assert.equal(delivered.status,200);
    assert.doesNotMatch(await delivered.text(),/node:crypto|deriveProof|PRIVATE_SECRET|SCO_PRIVATE_MODULE_GRAPH_KEY/u);
    assert.equal((await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:generated.methodNames.protectedDigest,args:['unauthorized']})
    })).status,403);
    globalThis.fetch=(url,options)=>nativeFetch(new URL(String(url),origin),{
      ...options,headers:{...options?.headers,'x-test-session':'allow'}
    });
    const client=await import(pathToFileURL(path.join(dir,'client.mjs')).href);
    for(const value of ['A','  BETA  ','Ωmega', 'hello-world']){
      assert.equal(client.format(value),native.format(value));
      assert.equal(await client.protectedDigest(value),await native.protectedDigest(value));
      assert.equal(await client.combined(value),await native.combined(value));
    }
  }finally{
    globalThis.fetch=nativeFetch;
    if(server){
      /** @type {Promise<void>} */
      const stopped=new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve()));
      await stopped;
    }
    await fs.rm(dir,{recursive:true,force:true});
  }
});
