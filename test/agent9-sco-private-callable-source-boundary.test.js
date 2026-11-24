'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {partitionScoSelectedAsyncExports,createScoSelectedHandler}=require('../src');
const {atomicWrite}=require('../src/atomic');

test('selected SCO private callable remains server-only while client host observes only its facade',{
  timeout:30000
},async()=>{
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
  const partition=partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:mixed
  },{
    seed:'agent9-sco-private-source-boundary-20261124',
    privateNames:['protectedDigest'],
    privateModuleImports:['./private/engine.mjs'],
    privateModuleSources:[engine,leaf]
  });
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-private-host-observer-'));
  const nativeFetch=globalThis.fetch;
  /** @type {import('node:http').Server|undefined} */
  let server;
  try{
    await atomicWrite(path.join(root,'mixed.mjs'),mixed);
    await atomicWrite(path.join(root,engine.path),engine.code);
    await atomicWrite(path.join(root,leaf.path),leaf.code);
    const native=await import(pathToFileURL(path.join(root,'mixed.mjs')).href);
    server=http.createServer(createScoSelectedHandler(partition,native,{
      authorizeRead:()=>true,
      authorizeRpc:()=>true
    }));
    const active=server;
    await new Promise(resolve=>active.listen(0,'127.0.0.1',()=>resolve(undefined)));
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    const facadeResponse=await nativeFetch(origin+'/obfs/mixed.mjs');
    assert.equal(facadeResponse.status,200);
    const facade=await facadeResponse.text();
    assert.equal(facade,partition.clientFile.code);
    assert.doesNotMatch(facade,/deriveProof|salt=41|secretValue|private\/engine/u);
    for(const privatePath of [engine.path,leaf.path]){
      const response=await nativeFetch(origin+'/obfs/'+privatePath);
      assert.equal(response.status,404);
    }

    await atomicWrite(path.join(root,'client.mjs'),facade);
    const entry=[
      "import {protectedDigest,format} from './client.mjs';",
      'ARM_HOST_OBSERVER();',
      'queueMicrotask(protectedDigest);',
      "console.log(format(1));"
    ].join('\n');
    await atomicWrite(path.join(root,'entry.mjs'),entry);
    const observationPath=path.join(root,'observation.json');
    const preload=[
      "'use strict';",
      "const fs=require('node:fs');",
      'globalThis.ARM_HOST_OBSERVER=function(){',
      '  globalThis.queueMicrotask=function(callback){',
      '    const source=Function.prototype.toString.call(callback);',
      "    fs.writeFileSync(process.env.OBFS_SCO_PRIVATE_OBSERVATION,JSON.stringify({source,invoked:false}));",
      '  };',
      '};'
    ].join('\n');
    const preloadPath=path.join(root,'preload.cjs');
    await atomicWrite(preloadPath,preload);
    const child=spawnSync(process.execPath,
      ['--require',preloadPath,path.join(root,'entry.mjs')],{
        encoding:'utf8',timeout:15000,
        env:{...process.env,OBFS_SCO_PRIVATE_OBSERVATION:observationPath}
      });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    assert.equal(child.stdout.trim(),'1!');
    const observed=JSON.parse(await fs.readFile(observationPath,'utf8'));
    const nativeSource=Function.prototype.toString.call(native.protectedDigest);
    assert.notEqual(observed.source,nativeSource,
      'client sees a generated facade, not the server implementation');
    assert.doesNotMatch(observed.source,/deriveProof|salt=41|secretValue|private\/engine/u);
    assert.equal(observed.invoked,false);
    console.log('AGENT9_SCO_PRIVATE_FACADE '+JSON.stringify({
      clientFacadeSource:observed.source,
      nativeServerSource:nativeSource,
      privatePathsWithheld:[engine.path,leaf.path],
      callbackInvoked:observed.invoked
    }));
  }finally{
    globalThis.fetch=nativeFetch;
    if(server){
      const active=server;
      await new Promise((resolve,reject)=>
        active.close(error=>error?reject(error):resolve(undefined)));
    }
    await fs.rm(root,{recursive:true,force:true});
  }
});
