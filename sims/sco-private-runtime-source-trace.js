'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {registerHooks}=require('node:module');
const {pathToFileURL,fileURLToPath}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');

/**
 * A trace collects *executed* module resolves, unlike the compiler's static
 * exact-source manifest. It is intentionally not a proof of unseen inputs,
 * custom loaders or hostile deployment behavior.
 *
 * Node's in-thread registerHooks API is available from Node v22.15.0.
 * The experiment runs in a dedicated process because hooks are persistent.
 */
const seenResolved=new Set();
registerHooks({
  resolve(specifier,context,nextResolve){
    const result=nextResolve(specifier,context);
    if(result.url.startsWith('file:'))seenResolved.add(fileURLToPath(result.url));
    return result;
  }
});

const source=[
  'const key=String.fromCharCode(99,111,110,115,116,114,117,99,116,111,114);',
  'const box={};',
  'const load=box[key][key]("p","return import(p)");',
  'export async function deriveProof(v){',
  '  const file=v%2?"./deep/odd.mjs":"./deep/even.mjs";',
  '  return (await load(file)).secretValue+v;',
  '}'
].join('\n');
const entry=[
  'import {deriveProof} from "./private/engine.mjs";',
  'export async function protectedOp(v){return deriveProof(v);}',
  'export function visible(v){return v;}'
].join('\n');
const odd={path:'private/deep/odd.mjs',code:'export const secretValue=17;\n'};
const even={path:'private/deep/even.mjs',code:'export const secretValue=11;\n'};

/**
 * @param {string} root
 * @returns {string[]}
 */
function observedUnder(root){
  return [...seenResolved].filter(filename=>{
    const relative=path.relative(root,filename);
    return relative!==''&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);
  }).map(filename=>path.relative(root,filename).split(path.sep).join('/'))
    .filter(filename=>filename.startsWith('private/deep/'))
    .sort();
}

/**
 * @param {string[]} traced
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function compile(traced){
  return partitionScoSelectedAsyncExports({
    path:'entry.mjs',sourceType:'module',code:entry
  },{
    seed:'sco-private-runtime-trace-20261116',
    privateNames:['protectedOp'],
    privateModuleImports:['./private/engine.mjs'],
    privateModuleSources:[{path:'private/engine.mjs',code:source}],
    additionalPrivateModulePaths:traced
  });
}

/**
 * @param {import('../src/core').SourceFile[]} files
 * @returns {Promise<number>}
 */
async function getOddStatus(files){
  const server=http.createServer(createScoHandler(files));
  try{
    await /** @type {Promise<void>} */ (new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve())));
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const response=await fetch('http://127.0.0.1:'+
      address.port+'/obfs/private/deep/odd.mjs');
    return response.status;
  }finally{
    await /** @type {Promise<void>} */ (new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve())));
  }
}

async function main(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-trace-'));
  try{
    await atomicWrite(path.join(root,'private/engine.mjs'),source);
    await atomicWrite(path.join(root,even.path),even.code);
    await atomicWrite(path.join(root,odd.path),odd.code);
    const original=await import(pathToFileURL(path.join(root,'private/engine.mjs')).href);
    assert.equal(await original.deriveProof(2),13);
    const afterEven=observedUnder(root);
    assert.deepEqual(afterEven,[even.path],
      'Only the even input has executed the even module');
    const evenOnly=compile(afterEven);
    assert.deepEqual(evenOnly.clientFile.privateModulePaths,
      ['private/deep/even.mjs','private/engine.mjs']);
    const uncoveredStatus=await getOddStatus([evenOnly.clientFile,odd]);
    assert.equal(uncoveredStatus,200,
      'The untested odd input leaves an undiscovered private HTTP source');

    assert.equal(await original.deriveProof(3),20);
    const afterBoth=observedUnder(root);
    assert.deepEqual(afterBoth,[even.path,odd.path]);
    const both=compile(afterBoth);
    assert.deepEqual(both.clientFile.privateModulePaths,
      ['private/deep/even.mjs','private/deep/odd.mjs','private/engine.mjs']);
    assert.throws(()=>createScoHandler([both.clientFile,odd]),
      /must not serve private source/u,
      'Observed runtime import must become a denied publication path');

    // Even a partial trace benefits from the independent reviewed whitelist.
    assert.throws(()=>createScoHandler([evenOnly.clientFile,odd],{
      publicPaths:['entry.mjs']
    }),/source is not in publicPaths/u);
    assert.doesNotThrow(()=>createScoHandler([both.clientFile],{
      publicPaths:['entry.mjs']
    }));

    // The traced path list also preserves the expected SCO JSON RPC boundary
    // for this two-branch original module. The public facade executes in Node
    // with an explicit authenticated localhost fetch adapter.
    await atomicWrite(path.join(root,'entry.mjs'),entry);
    await atomicWrite(path.join(root,'client.mjs'),both.clientFile.code);
    const native=await import(pathToFileURL(path.join(root,'entry.mjs')).href);
    const remoteMethods=bindScoModuleExports(both,native);
    const server=http.createServer(createScoHandler([both.clientFile],{
      publicPaths:['entry.mjs'],remoteMethods,
      authorizeRpc:request=>request.headers['x-test-session']==='allow',
      authorizeRead:request=>request.headers['x-test-session']==='allow',
      authorizeOperation:(request,method,args)=>
        request.headers['x-test-session']==='allow'&&
        method===both.methodNames.protectedOp&&
        args.length===1&&typeof args[0]==='number'
    }));
    const originalFetch=globalThis.fetch;
    let clientValues;
    try{
      await /** @type {Promise<void>} */ (new Promise(resolve=>
        server.listen(0,'127.0.0.1',()=>resolve())));
      const address=server.address();
      assert.ok(address&&typeof address!=='string');
      const origin='http://127.0.0.1:'+address.port;
      const unauth=await originalFetch(origin+'/obfs/rpc',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({method:both.methodNames.protectedOp,args:[2]})
      });
      assert.equal(unauth.status,403);
      assert.equal((await originalFetch(origin+'/obfs/'+odd.path,{
        headers:{'x-test-session':'allow'}
      })).status,404);
      globalThis.fetch=(input,init)=>{
        const headers=new Headers(init?.headers);
        headers.set('x-test-session','allow');
        return originalFetch(new URL(String(input),origin),{...init,headers});
      };
      const client=await import(pathToFileURL(path.join(root,'client.mjs')).href);
      assert.equal(client.visible(9),native.visible(9));
      const first=await client.protectedOp(2);
      const second=await client.protectedOp(3);
      assert.equal(first,await native.protectedOp(2));
      assert.equal(second,await native.protectedOp(3));
      clientValues=[first,second];
    }finally{
      globalThis.fetch=originalFetch;
      await /** @type {Promise<void>} */ (new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve())));
    }

    console.log('SCO_RUNTIME_SOURCE_TRACE '+JSON.stringify({
      node:process.version,platform:process.platform,
      hook:'node:module.registerHooks',
      nativeValues:[13,20],clientValues,
      afterEven,afterBoth,
      uncoveredOddHttpStatus:uncoveredStatus,
      bothObservedRefused:true,
      partialTracePublicAllowlistBlocked:true,
      limitation:'Executed-input trace; not exhaustive coverage or a proof of no dynamic imports'
    }));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
