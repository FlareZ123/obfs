'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler,partitionScoSelectedAsyncExports}=require('../src');

const entry=[
  'import {deriveProof} from "./private/engine.mjs";',
  'export async function protectedValue(value){return deriveProof(value);}',
  'export function display(value){return String(value).trim();}'
].join('\n');
const partition=partitionScoSelectedAsyncExports({
  path:'entry.mjs',sourceType:'module',code:entry
},{
  seed:'positive-public-allowlist',privateNames:['protectedValue'],
  privateModuleImports:['./private/engine.mjs']
});
const unlisted={
  path:'private/unlisted.cjs',sourceType:'commonjs',
  code:'module.exports.secretCanary="PRIVATE_SOURCE_SHOULD_NOT_BE_PUBLISHED";'
};

/**
 * @param {import('node:http').RequestListener} handler
 * @param {string} name
 * @returns {Promise<{status:number,body:string}>}
 */
async function fetchFile(handler,name){
  const server=http.createServer(handler);
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/'+name);
    return {status:response.status,body:await response.text()};
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>
      error?reject(error):resolve()));
  }
}

test('opt-in publicPaths rejects accidental private source independent of graph inference',()=>{
  assert.deepEqual(partition.clientFile.privateModulePaths,['private/engine.mjs']);
  assert.doesNotThrow(()=>createScoHandler([partition.clientFile]));
  for(const files of [
    [partition.clientFile,unlisted],
    [unlisted,partition.clientFile]
  ]){
    assert.throws(()=>createScoHandler(files,{publicPaths:['entry.mjs']}),
      /not in publicPaths: private\/unlisted\.cjs/u);
  }
  assert.doesNotThrow(()=>createScoHandler([partition.clientFile],{
    publicPaths:['entry.mjs']
  }));
});

test('SCO publicPaths exactly covers reviewed source and public assets',()=>{
  const asset={path:'style.css',code:'body{color:blue}',sourceType:'asset'};
  const files=[partition.clientFile,asset];
  assert.doesNotThrow(()=>createScoHandler(files,{
    publicPaths:['entry.mjs','style.css']
  }));
  for(const publicPaths of [
    ['entry.mjs'],['style.css'],['entry.mjs','style.css','unused.mjs']
  ]){
    assert.throws(()=>createScoHandler(files,{publicPaths}),
      /not in publicPaths|exactly match supplied sourceFiles/u);
  }
});

test('SCO publicPaths rejects malformed, ambiguous and noncanonical declarations',()=>{
  for(const publicPaths of [
    /** @type {any} */ ('entry.mjs'),
    /** @type {any} */ (null),
    /** @type {any} */ ([7]),
    ['entry.mjs','ENTRY.MJS'],
    ['entry.mjs','./entry.mjs'],
    ['entry.mjs','../private/unlisted.cjs']
  ]){
    assert.throws(()=>createScoHandler([partition.clientFile],{publicPaths}),
      /publicPaths|Unsafe|noncanonical/u);
  }
});

test('real SCO HTTP reproduces legacy leakage and positive boundary refusal',{
  timeout:15000
},async()=>{
  const legacy=createScoHandler([partition.clientFile,unlisted]);
  const response=await fetchFile(legacy,'private/unlisted.cjs');
  assert.equal(response.status,200);
  assert.match(response.body,/PRIVATE_SOURCE_SHOULD_NOT_BE_PUBLISHED/u);
  assert.throws(()=>createScoHandler([partition.clientFile,unlisted],{
    publicPaths:['entry.mjs']
  }),/not in publicPaths/u);
  const allowed=createScoHandler([partition.clientFile],{
    publicPaths:['entry.mjs']
  });
  const served=await fetchFile(allowed,'entry.mjs');
  assert.equal(served.status,200);
  assert.doesNotMatch(served.body,/PRIVATE_SOURCE_SHOULD_NOT_BE_PUBLISHED/u);
});
