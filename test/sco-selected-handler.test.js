'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {
  partitionScoSelectedAsyncExports,verifyScoPrivateSourceDigests,
  createScoSelectedHandler
}=require('../src');

const mixed=[
  'import {deriveProof} from "./private/engine.mjs";',
  'export async function protectedDigest(value){return deriveProof(value);}',
  'export function format(value){return String(value).trim()+"!";}'
].join('\n');
const engine={
  path:'private/engine.mjs',
  code:'import {salt} from "./leaf.mjs"; export function deriveProof(v){return v+salt;}'
};
const leaf={path:'private/leaf.mjs',code:'export const salt=41;'};

/** @returns {ReturnType<typeof partitionScoSelectedAsyncExports>} */
function compile(){
  return partitionScoSelectedAsyncExports({
    path:'mixed.mjs',code:mixed,sourceType:'module'
  },{
    seed:'selective-sealed-handler-20261117',
    privateNames:['protectedDigest'],
    privateModuleImports:['./private/engine.mjs'],
    privateModuleSources:[engine,leaf]
  });
}

test('selective compiler-owned SCO handler serves only generated facade and matches native private graph',{
  timeout:30000
},async()=>{
  const partition=compile();
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-selected-handler-'));
  const nativeFetch=globalThis.fetch;
  /** @type {import('node:http').Server|undefined} */
  let server;
  try{
    await atomicWrite(path.join(root,'mixed.mjs'),mixed);
    await atomicWrite(path.join(root,engine.path),engine.code);
    await atomicWrite(path.join(root,leaf.path),leaf.code);
    await verifyScoPrivateSourceDigests(partition,root);
    const native=await import(pathToFileURL(path.join(root,'mixed.mjs')).href);
    server=http.createServer(createScoSelectedHandler(partition,native,{
      authorizeRead:req=>req.headers['x-test-session']==='allow',
      authorizeRpc:req=>req.headers['x-test-session']==='allow',
      authorizeOperation:(req,method,args)=>
        req.headers['x-test-session']==='allow' &&
        method===partition.methodNames.protectedDigest &&
        args.length===1&&typeof args[0]==='number'
    }));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    const untrusted=await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:partition.methodNames.protectedDigest,args:[1]})
    });
    assert.equal(untrusted.status,403);
    for(const hidden of [engine.path,leaf.path]){
      const result=await nativeFetch(origin+'/obfs/'+hidden,{
        headers:{'x-test-session':'allow'}
      });
      assert.equal(result.status,404,'No accidental private dependency route: '+hidden);
    }
    const facade=await nativeFetch(origin+'/obfs/mixed.mjs',{
      headers:{'x-test-session':'allow'}
    });
    assert.equal(facade.status,200);
    const delivered=await facade.text();
    assert.doesNotMatch(delivered,/salt=41|deriveProof/u);
    await atomicWrite(path.join(root,'client.mjs'),partition.clientFile.code);
    globalThis.fetch=(url,options)=>nativeFetch(new URL(String(url),origin),{
      ...options,headers:{...options?.headers,'x-test-session':'allow'}
    });
    const client=await import(pathToFileURL(path.join(root,'client.mjs')).href);
    for(const value of [1,3,-4,17,987654]){
      assert.equal(client.format(value),native.format(value));
      assert.equal(await client.protectedDigest(value),await native.protectedDigest(value));
    }
  }finally{
    globalThis.fetch=nativeFetch;
    if(server){
      await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    }
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('selective SCO handler rejects copied, mutated, untrusted or misconfigured partitions',()=>{
  const partition=compile();
  const native={protectedDigest:async (/** @type {number} */ x)=>x+41};
  const authorized={authorizeRpc:()=>true};
  assert.throws(()=>createScoSelectedHandler({...partition},native,authorized),
    /requires a partition generated in this process/);
  assert.throws(()=>createScoSelectedHandler(
    /** @type {any} */ ({...partition,clientFile:{...partition.clientFile}}),native,authorized),
    /generated in this process/);
  assert.throws(()=>createScoSelectedHandler(partition,native,{
    ...authorized,routePrefix:'/alternate/'
  }),/RPC endpoint does not match routePrefix/);
  assert.throws(()=>createScoSelectedHandler(partition,native,
    /** @type {any} */ ({...authorized,publicPaths:['mixed.mjs']})),
    /separately authorized server options/);
  assert.throws(()=>createScoSelectedHandler(partition,native,
    /** @type {any} */ ({...authorized,remoteMethods:{wrong:()=>0}})),
    /separately authorized server options/);
  assert.throws(()=>createScoSelectedHandler(partition,{},authorized),
    /Missing executable server export/);

  const originalCode=partition.clientFile.code;
  try{
    partition.clientFile.code='export const exposedPrivate = 41;';
    assert.throws(()=>createScoSelectedHandler(partition,native,authorized),
      /manifest was modified after partitioning/);
  }finally{
    partition.clientFile.code=originalCode;
  }
  assert.doesNotThrow(()=>createScoSelectedHandler(partition,native,authorized));
});

test('selected SCO wrapper uses one authoritative route prefix from option accessors',{
  timeout:15000
},async()=>{
  const partition=compile();
  let routePrefixReads=0;
  const native={protectedDigest:async (/** @type {number} */ x)=>x+41};
  const options={
    authorizeRpc:()=>true,
    get routePrefix(){
      routePrefixReads++;
      return routePrefixReads===1?'/obfs/':'/different/';
    }
  };
  const server=http.createServer(createScoSelectedHandler(partition,native,options));
  try{
    assert.equal(routePrefixReads,1,'The endpoint and handler must use one captured prefix');
    await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/rpc',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        method:partition.methodNames.protectedDigest,
        args:[1]
      })
    });
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true,value:42});
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
});

test('selective SCO handler snapshots compiler-owned source across changing getters',()=>{
  const partition=compile();
  const native={protectedDigest:async (/** @type {number} */ x)=>x+41};
  const original=partition.clientFile;
  let reads=0;
  Object.defineProperty(original,'code',{
    configurable:true,
    get(){
      reads++;
      return reads===1?original.path:'export const leaked = 41;';
    }
  });
  // Accessor changes are checked before serving. JSON serialization reads
  // the getter once; publishing uses the immutable internal compiler copy.
  assert.throws(()=>createScoSelectedHandler(partition,native,{
    authorizeRpc:()=>true
  }),/manifest was modified after partitioning/);
  assert.equal(reads,1);
});
