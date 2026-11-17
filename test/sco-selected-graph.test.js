'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {
  partitionScoSelectedGraph,bindScoSelectedGraphExports,
  createScoSelectedGraphHandler,verifyScoPrivateSourceDigests
}=require('../src');

const leaf={
  path:'private/salt.mjs',
  code:'export const salt=41; // SCO_SELECTED_SHARED_PRIVATE_CANARY_8181'
};
const alpha=[
  'import {salt} from "./private/salt.mjs";',
  'function hidden(value){return salt+value.length;}',
  'export async function secret(value){return hidden(value);}',
  'export function local(value){return value.toUpperCase();}',
  'export async function combined(value){return local(value)+":"+await secret(value);}'
].join('\n');
const beta=[
  'import {salt} from "./private/salt.mjs";',
  'const PRIVATE_BETA_SEED=19;',
  'export async function secret(value){return salt+PRIVATE_BETA_SEED+value.length;}',
  'export function local(value){return value.length*2;}',
  'export async function combined(value){return await secret(value)+local(value);}'
].join('\n');

/** @returns {import('../src/sco-selected-graph').ScoSelectedGraph} */
function compile(){
  return partitionScoSelectedGraph([
    {file:{path:'alpha.mjs',code:alpha,sourceType:'module'},options:{
      seed:'selected-graph-seal-20261117',privateNames:['secret'],
      privateModuleImports:['./private/salt.mjs'],privateModuleSources:[leaf]
    }},
    {file:{path:'beta.mjs',code:beta,sourceType:'module'},options:{
      seed:'selected-graph-seal-20261117',privateNames:['secret'],
      privateModuleImports:['./private/salt.mjs'],privateModuleSources:[leaf]
    }}
  ]);
}

/** @param {import('node:http').Server} server @returns {Promise<string>} */
async function listen(server){
  /** @type {Promise<void>} */
  const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await ready;
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Unexpected HTTP address');
  return 'http://127.0.0.1:'+address.port;
}

/** @param {import('node:http').Server} server @returns {Promise<void>} */
async function close(server){
  /** @type {Promise<void>} */
  const ended=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await ended;
}

test('two selected SCO modules share a private static ESM dependency and publish only facades',{
  timeout:30000
},async()=>{
  const graph=compile();
  assert.deepEqual(graph.exposedPaths,['alpha.mjs','beta.mjs']);
  assert.deepEqual(graph.privatePaths,[leaf.path]);
  assert.equal(graph.privateSourceDigests.length,3);
  const ids=graph.exposedPaths.map(name=>graph.partitions[name].methodNames.secret);
  assert.notEqual(ids[0],ids[1],'RPC names must include module identity');
  for(const file of graph.clientFiles){
    assert.doesNotMatch(file.code,/PRIVATE_BETA_SEED|SHARED_PRIVATE_CANARY|function hidden/u);
    assert.deepEqual(file.privateModulePaths,[leaf.path]);
    assert.equal(file.privateOriginalDigests?.length,3);
  }

  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-selected-graph-'));
  const originalFetch=globalThis.fetch;
  /** @type {import('node:http').Server|undefined} */
  let server;
  try{
    await atomicWrite(path.join(root,'alpha.mjs'),alpha);
    await atomicWrite(path.join(root,'beta.mjs'),beta);
    await atomicWrite(path.join(root,leaf.path),leaf.code);
    await verifyScoPrivateSourceDigests(graph,root);
    const original=Object.create(null);
    for(const name of graph.exposedPaths){
      original[name]=await import(pathToFileURL(path.join(root,name)).href);
      await atomicWrite(path.join(root,'public',name),
        /** @type {import('../src/sco-partition').ScoModulePartition['clientFile']} */
        (graph.partitions[name].clientFile).code);
    }
    const methods=bindScoSelectedGraphExports(graph,original);
    assert.equal(Object.keys(methods).length,2);
    const token='selected-test-authorized';
    let calls=0;
    server=http.createServer(createScoSelectedGraphHandler(graph,original,{
      authorizeRead:req=>req.headers['x-test-session']===token,
      authorizeRpc:req=>req.headers['x-test-session']===token,
      authorizeOperation:(req,method,args)=>{
        if(req.headers['x-test-session']!==token||
           !Object.hasOwn(methods,method)||args.length!==1||
           typeof args[0]!=='string')return false;
        calls++;
        return true;
      }
    }));
    const origin=await listen(server);
    assert.equal((await originalFetch(origin+'/obfs/alpha.mjs')).status,403);
    assert.equal((await originalFetch(origin+'/obfs/private/salt.mjs',{
      headers:{'x-test-session':token}
    })).status,404);
    for(const name of graph.exposedPaths){
      const response=await originalFetch(origin+'/obfs/'+name,{
        headers:{'x-test-session':token}
      });
      assert.equal(response.status,200);
      const published=await response.text();
      assert.equal(published,graph.partitions[name].clientFile.code);
      assert.ok(!published.includes('SCO_SELECTED_SHARED_PRIVATE_CANARY'));
      assert.ok(!published.includes('PRIVATE_BETA_SEED'));
    }
    const forbidden=await originalFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:ids[0],args:['A']})
    });
    assert.equal(forbidden.status,403);
    globalThis.fetch=(url,options)=>originalFetch(
      new URL(/** @type {string} */ (url),origin),{
        ...options,headers:{...options?.headers,'x-test-session':token}
      });
    const clients=Object.create(null);
    for(const name of graph.exposedPaths){
      clients[name]=await import(pathToFileURL(path.join(root,'public',name)).href);
    }
    for(const value of ['','Alpha','Ωmega','🚀x']){
      for(const name of graph.exposedPaths){
        assert.equal(clients[name].local(value),original[name].local(value));
        assert.equal(await clients[name].combined(value),
          await original[name].combined(value));
      }
    }
    assert.equal(calls,8);
  }finally{
    globalThis.fetch=originalFetch;
    if(server)await close(server);
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('selected SCO composition refuses ambiguous graph paths and source ownership',()=>{
  const valid=compile();
  assert.deepEqual(Object.keys(valid.partitions),['alpha.mjs','beta.mjs']);
  assert.throws(()=>partitionScoSelectedGraph([]),/at least one/u);
  assert.throws(()=>partitionScoSelectedGraph([{
    file:{path:'alpha.mjs',code:alpha},options:{
      privateNames:['secret'],privateModuleImports:['./private/salt.mjs']
    }
  }]),/lacks an audited source digest/u);
  const second='export async function secret(value){return value+1;}'+
    'export function local(value){return value;}';
  const first='import {secret as sibling} from "./beta.mjs";'+
    'export async function secret(value){return sibling(value);}'+
    'export function local(value){return value;}';
  assert.throws(()=>partitionScoSelectedGraph([
    {file:{path:'alpha.mjs',code:first},options:{
      privateNames:['secret'],privateModuleImports:['./beta.mjs'],
      privateModuleSources:[{path:'beta.mjs',code:second}]
    }},
    {file:{path:'beta.mjs',code:second},options:{privateNames:['secret']}}
  ]),/overlaps a private dependency/u);
  const simple='export async function secret(value){return value+1;}'+
    'export function local(value){return value;}';
  assert.throws(()=>partitionScoSelectedGraph([
    {file:{path:'alpha.mjs',code:simple},options:{privateNames:['secret']}},
    {file:{path:'ALPHA.mjs',code:simple},options:{privateNames:['secret']}}
  ]),/Case-colliding/u);
  assert.throws(()=>partitionScoSelectedGraph([
    {file:{path:'alpha.mjs',code:simple},options:{privateNames:['secret']}},
    {file:{path:'alpha.mjs',code:simple},options:{privateNames:['secret']}}
  ]),/Duplicate/u);
  assert.throws(()=>partitionScoSelectedGraph([
    {file:{path:'alpha.mjs',code:alpha},options:{
      privateNames:['secret'],privateModuleImports:['./private/salt.mjs'],
      privateModuleSources:[leaf]
    }},
    {file:{path:'beta.mjs',code:beta},options:{
      privateNames:['secret'],privateModuleImports:['./private/salt.mjs'],
      privateModuleSources:[{path:leaf.path,code:'export const salt=99;'}]
    }}
  ]),/Conflicting/u);
});

test('selected SCO handler seals all emitted bytes and requires independent authorization options',()=>{
  const source=compile();
  const namespaces={};
  assert.throws(()=>createScoSelectedGraphHandler(
    /** @type {import('../src/sco-selected-graph').ScoSelectedGraph} */
    (JSON.parse(JSON.stringify(source))),namespaces,{}
  ),/in-process compiler/u);
  assert.throws(()=>createScoSelectedGraphHandler(source,namespaces,{
    routePrefix:'/different/'
  }),/endpoint does not match/u);
  assert.throws(()=>createScoSelectedGraphHandler(source,namespaces,{
    publicPaths:['secret.mjs']
  }),/authorized server options/u);
  assert.throws(()=>createScoSelectedGraphHandler(source,namespaces,{}),
    /Missing selected SCO private namespace/u);

  const modified=compile();
  modified.clientFiles[0].code='export const leaked="SECRET";';
  assert.throws(()=>createScoSelectedGraphHandler(modified,namespaces,{}),
    /manifest was modified/u);
  const reordered=compile();
  reordered.exposedPaths.reverse();
  assert.throws(()=>createScoSelectedGraphHandler(reordered,namespaces,{}),
    /manifest was modified/u);
  const changedMetadata=compile();
  changedMetadata.privateSourceDigests[0].sha256='0'.repeat(64);
  assert.throws(()=>createScoSelectedGraphHandler(changedMetadata,namespaces,{}),
    /manifest was modified/u);
});


test('selected SCO graph snapshots accessor-backed source records once',()=>{
  const source='export async function secret(value){return value*3;}'+
    'export function local(value){return value+2;}';
  let fileReads=0;
  let pathReads=0;
  let codeReads=0;
  let typeReads=0;
  const supplied={
    get path(){pathReads++;return 'owned.mjs';},
    get code(){codeReads++;return source;},
    get sourceType(){typeReads++;return /** @type {'module'} */ ('module');}
  };
  const unit={
    get file(){
      fileReads++;
      if(fileReads!==1)throw Error('Source record was read more than once');
      return supplied;
    },
    options:{privateNames:['secret'],seed:'single-read-source-owner'}
  };
  const graph=partitionScoSelectedGraph([unit]);
  assert.equal(fileReads,1);
  assert.equal(pathReads,1);
  assert.equal(codeReads,1);
  assert.equal(typeReads,1);
  assert.deepEqual(graph.exposedPaths,['owned.mjs']);
  assert.match(graph.clientFiles[0].code,/export function local/u);
  assert.doesNotMatch(graph.clientFiles[0].code,/value\*3/u);
});


test('selected SCO graph serves sealed code despite a getter changing after manifest comparison',{
  timeout:15000
},async()=>{
  const graph=compile();
  const original=graph.clientFiles[0].code;
  const namespaces=Object.create(null);
  for(const name of graph.exposedPaths){
    namespaces[name]={secret:async value=>String(value).length+41};
  }
  let reads=0;
  Object.defineProperty(graph.clientFiles[0],'code',{
    enumerable:true,configurable:true,
    get(){
      reads++;
      return reads<=2?original:
        'export const PRIVATE_SOURCE_LEAK="should never be served";';
    }
  });
  const server=http.createServer(createScoSelectedGraphHandler(graph,namespaces,{
    authorizeRead:()=>true,authorizeRpc:()=>true,authorizeOperation:()=>true
  }));
  try{
    const origin=await listen(server);
    const response=await globalThis.fetch(origin+'/obfs/alpha.mjs');
    assert.equal(response.status,200);
    assert.equal(await response.text(),original);
    assert.ok(reads<=2,'Handler must never reread the untrusted facade getter');
  }finally{
    await close(server);
  }
});
