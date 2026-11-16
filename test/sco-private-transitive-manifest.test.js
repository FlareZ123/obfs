'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');

const entry=[
  'import {deriveProof} from "./private/engine.mjs";',
  'export async function protectedDigest(value){return deriveProof(value);}',
  'export function format(value){return String(value).trim();}'
].join('\n');
const engine={
  path:'private/engine.mjs',
  code:'import {secretValue} from "./deep/secret.mjs"; export function deriveProof(value){return secretValue+value;}'
};
const leaf={path:'private/deep/secret.mjs',code:'export const secretValue=41;'};

/**
 * @param {{path:string,code:string}[]} graph
 * @param {string[]} [additionalPrivateModulePaths]
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function emit(graph,additionalPrivateModulePaths=[]) {
  return partitionScoSelectedAsyncExports({path:'mixed.mjs',sourceType:'module',code:entry},{
    seed:'transitive-private-manifest-20261116',privateNames:['protectedDigest'],
    privateModuleImports:['./private/engine.mjs'],
    privateModuleSources:graph,additionalPrivateModulePaths
  });
}

test('closed-world private ESM graph tracks transitive import and reexport paths',()=>{
  const generated=emit([engine,leaf]);
  const directOnly=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code:entry},
    {seed:'transitive-private-manifest-20261116',
      privateNames:['protectedDigest'],
      privateModuleImports:['./private/engine.mjs']}
  );
  assert.equal(generated.clientFile.code,directOnly.clientFile.code,
    'Static-only source auditing must not change runtime client JavaScript');
  assert.deepEqual(generated.clientFile.privateModulePaths,[
    'private/engine.mjs','private/deep/secret.mjs'
  ]);
  assert.doesNotMatch(generated.clientFile.code,/secretValue|deriveProof|private\/engine/u);
  assert.throws(()=>createScoHandler([generated.clientFile,leaf]),/must not serve private source/);
  assert.throws(()=>createScoHandler([leaf,generated.clientFile]),/must not serve private source/);
  const throughReexport=emit([
    {...engine,code:'export {deriveProof} from "./deep/secret.mjs";'},
    {...leaf,code:'export function deriveProof(value){return value.length+41;}'}
  ]);
  assert.ok(throughReexport.clientFile.privateModulePaths.includes(leaf.path));
});

test('closed-world graph rejects missing, extra and ambiguous source paths',()=>{
  assert.throws(()=>emit([engine]),/dependency source missing: private\/deep\/secret\.mjs/);
  assert.throws(()=>emit([engine,leaf,{path:'private/unused.mjs',code:'export const x=1;'}]),
    /exactly the reachable static graph/);
  assert.throws(()=>emit([engine,leaf,{path:'PRIVATE\/engine.mjs',code:engine.code}]),
    /distinct \.mjs paths/);
  assert.throws(()=>emit(/** @type {any} */ (['unexpected'])),/must contain \{path,code\}/);
  assert.throws(()=>emit([engine,leaf],['../escaped.mjs']),/canonical relative \.mjs paths/);
});

test('closed-world graph refuses untracked dynamic and noncanonical loaders',()=>{
  for(const code of [
    'export async function deriveProof(v){return import("./deep/secret.mjs");}',
    'export function deriveProof(v){return require("./deep/secret.mjs");}',
    'export {secretValue as deriveProof} from "../outside.mjs";',
    'import {secretValue} from "package-name"; export {secretValue as deriveProof};',
    'import {secretValue} from "./deep/%73ecret.mjs"; export {secretValue as deriveProof};',
    'const loader=Function; export function deriveProof(v){return loader("return 3")();}',
    'export function deriveProof(v){return new Function("return 3")();}',
    'const source=import.meta.url; export function deriveProof(v){return source;}',
    'import {createRequire as loaderFactory} from "node:module"; const load=loaderFactory(import.meta.url); export function deriveProof(v){return load("./other.cjs");}',
    'import {Worker as W} from "node:worker_threads"; export function deriveProof(v){return new W(v);}',
    'const builtin=process.getBuiltinModule("node:module"); export function deriveProof(v){return builtin.createRequire(v);}',
    'const {getBuiltinModule}=process; export function deriveProof(v){return getBuiltinModule("node:module");}',
    'const p=process; export function deriveProof(v){return p["getBuiltinModule"]("node:module");}',
    'const p=globalThis.process; export function deriveProof(v){return p.getBuiltinModule("node:module");}',
    'import {getBuiltinModule as pick} from "node:process"; export function deriveProof(v){return pick("node:module");}'
  ]) {
    assert.throws(()=>emit([{...engine,code},leaf]),
      /unproved runtime loader|canonical relative \.mjs imports|cannot audit dynamic Node loader|unproved Node process loader|cross-realm global state/,
      'Private source should be declined: '+code);
  }
});

test('private static graph audit remains optional for legacy caller-reviewed paths',()=>{
  const generated=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code:entry},
    {seed:'legacy-direct-20261116',privateNames:['protectedDigest'],
      privateModuleImports:['./private/engine.mjs']}
  );
  assert.deepEqual(generated.clientFile.privateModulePaths,['private/engine.mjs']);
});

test('direct-only manifest permits accidentally served transitive source, audited closure refuses it',{
  timeout:15000
},async()=>{
  const directOnly=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code:entry},
    {seed:'unprotected-direct-only-20261116',
      privateNames:['protectedDigest'],privateModuleImports:['./private/engine.mjs']}
  );
  assert.deepEqual(directOnly.clientFile.privateModulePaths,['private/engine.mjs']);
  // A mistakenly published private leaf is invisible to the older direct-only
  // manifest. Its actual source is delivered by the real HTTP handler.
  const server=http.createServer(createScoHandler([directOnly.clientFile,leaf]));
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/'+leaf.path);
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type')??'',/text\/javascript/u);
    assert.match(await response.text(),/secretValue/u);
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
  }
  const audited=emit([engine,leaf]);
  assert.throws(()=>createScoHandler([audited.clientFile,leaf]),
    /must not serve private source/);
});

test('static private closure supports canonical cycles without repeated scanning',()=>{
  const first={
    path:'private/engine.mjs',
    code:'import {leaf} from "./leaf.mjs"; export function deriveProof(v){return leaf(v);}'
  };
  const second={
    path:'private/leaf.mjs',
    code:'import {deriveProof} from "./engine.mjs"; export function leaf(v){return v+1;}'
  };
  const generated=emit([first,second]);
  assert.deepEqual(generated.clientFile.privateModulePaths,
    ['private/engine.mjs','private/leaf.mjs']);
});

test('source-audited private graph refuses visible intrinsic and global effects',()=>{
  for(const code of [
    'Math.__privateRealmCanary=41; export function deriveProof(v){return v;}',
    'Object.prototype.__privateRealmCanary=41; export function deriveProof(v){return v;}',
    'const root=globalThis; root.__privateRealmCanary=41; export function deriveProof(v){return v;}',
    'const root=globalThis; const r=root; r.__privateRealmCanary++; export function deriveProof(v){return v;}',
    'Object.assign(globalThis,{__privateRealmCanary:41}); export function deriveProof(v){return v;}',
    'const globalAlias=globalThis; const setter=Reflect.set; setter(globalAlias,"__privateRealmCanary",41); export function deriveProof(v){return v;}',
    'const root=globalThis; root.customMutator({__privateRealmCanary:41}); export function deriveProof(v){return v;}'
  ]){
    assert.throws(()=>emit([{path:engine.path,code}]),
      /realm-local|cross-realm global state/u,code);
  }
  const safe={
    path:engine.path,
    code:'import {createHash} from "node:crypto"; export function deriveProof(v){return createHash("sha256").update(v).digest("hex");}'
  };
  assert.doesNotThrow(()=>emit([safe]));
});

test('actual three-file private ESM graph matches generated authenticated browser facade',{
  timeout:60000
},async()=>{
  const original=entry;
  const generated=emit([engine,leaf]);
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-transitive-'));
  const nativeFetch=globalThis.fetch;
  /** @type {import('node:http').Server|undefined} */
  let server;
  try{
    await atomicWrite(path.join(folder,'mixed.mjs'),original);
    await atomicWrite(path.join(folder,engine.path),engine.code);
    await atomicWrite(path.join(folder,leaf.path),leaf.code);
    await atomicWrite(path.join(folder,'client.mjs'),generated.clientFile.code);
    const native=await import(pathToFileURL(path.join(folder,'mixed.mjs')).href);
    const methods=bindScoModuleExports(generated,native);
    server=http.createServer(createScoHandler([generated.clientFile],{
      remoteMethods:methods,
      authorizeRead:req=>req.headers['x-test-session']==='allow',
      authorizeRpc:req=>req.headers['x-test-session']==='allow',
      authorizeOperation:(req,method,args)=>
        req.headers['x-test-session']==='allow' &&
        method===generated.methodNames.protectedDigest &&
        args.length===1 && typeof args[0]==='number'
    }));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    const unauthorized=await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:generated.methodNames.protectedDigest,args:[2]})
    });
    assert.equal(unauthorized.status,403);
    assert.equal((await nativeFetch(origin+'/obfs/'+leaf.path,{
      headers:{'x-test-session':'allow'}
    })).status,404);
    globalThis.fetch=(url,options)=>nativeFetch(new URL(String(url),origin),{
      ...options,headers:{...options?.headers,'x-test-session':'allow'}
    });
    const client=await import(pathToFileURL(path.join(folder,'client.mjs')).href);
    for(const value of [1,2,-3,25,987654]){
      assert.equal(client.format(value),native.format(value));
      assert.equal(await client.protectedDigest(value),await native.protectedDigest(value));
    }
  }finally{
    globalThis.fetch=nativeFetch;
    if(server)await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await fs.rm(folder,{recursive:true,force:true});
  }
});

test('explicit SCO publicPaths and audited private graph are independent publication gates',()=>{
  const directOnly=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code:entry},
    {seed:'public-source-defense-in-depth-20261116',
      privateNames:['protectedDigest'],privateModuleImports:['./private/engine.mjs']}
  );
  assert.throws(()=>createScoHandler([directOnly.clientFile,leaf],{
    publicPaths:['mixed.mjs']
  }),/source is not in publicPaths/);
  const audited=emit([engine,leaf]);
  assert.throws(()=>createScoHandler([audited.clientFile,leaf],{
    publicPaths:['mixed.mjs',leaf.path]
  }),/must not serve private source/);
  assert.doesNotThrow(()=>createScoHandler([audited.clientFile],{
    publicPaths:['mixed.mjs']
  }));
});

test('constructor-chain loaders cannot evade private source audit',{timeout:15000},async()=>{
  // The Function constructor reached via a function instance is dynamically
  // equivalent to Function("p","return import(p)") but has no Function token
  // or ImportExpression in the AST of the audited private source.
  const hidden=[
    'const load=(()=>0).constructor("p","return import(p)");',
    'export async function deriveProof(v){return (await load("./deep/secret.mjs")).secretValue+v;}'
  ].join('\n');
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-constructor-audit-'));
  try{
    await atomicWrite(path.join(folder,engine.path),hidden);
    await atomicWrite(path.join(folder,leaf.path),leaf.code);
    const native=await import(pathToFileURL(path.join(folder,engine.path)).href);
    assert.equal(await native.deriveProof(1),42,'Native Node dynamically loads the undeclared secret module');
  }finally{
    await fs.rm(folder,{recursive:true,force:true});
  }
  for(const code of [
    hidden,
    'const load=(()=>0)["con"+"structor"]("p","return import(p)"); export async function deriveProof(v){return (await load("./deep/secret.mjs")).secretValue+v;}',
    'const Factory=({}).constructor.constructor; const load=Factory("p","return import(p)"); export async function deriveProof(v){return (await load("./deep/secret.mjs")).secretValue+v;}',
    'const {constructor:Factory}=(()=>0); const load=Factory("p","return import(p)"); export async function deriveProof(v){return (await load("./deep/secret.mjs")).secretValue+v;}'
  ]){
    assert.throws(()=>emit([{path:engine.path,code}]),
      /unproved runtime loader|realm-local/u,
      'Audited graph must decline a hidden dynamic ESM loader: '+code);
  }
  const harmless={path:engine.path,
    code:'const record={answer:41}; export function deriveProof(v){return record.answer+v;}'};
  assert.doesNotThrow(()=>emit([harmless]),
    'Ordinary private property reads remain eligible');
});
