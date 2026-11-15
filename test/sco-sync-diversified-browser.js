'use strict';

const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {promisify}=require('node:util');
const {atomicWrite}=require('../src/atomic');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');
const {binaryWords}=require('../sims/sco-sync-search');
const {searchSynchronizingWordDiversified}=require('../sims/sco-sync-diversified');
const {makeSynchronizingMachine}=require('../sims/sco-synchronizing-oracle');

/**
 * Launch a real headless Chromium tab against the original authorized SCO
 * HTTP service and its compiler-generated browser ESM facade. The attacker
 * receives only public step calls; its source is formed from the SAME CJS
 * function definitions used in the Node experiments.
 *
 * @returns {Promise<void>}
 */
async function main(){
  const machine=makeSynchronizingMachine(0x5f3a17d2);
  const privateCanary='browser-private-machine-canary-49';
  const original=[
    'const model='+JSON.stringify(machine)+';',
    'const canary='+JSON.stringify(privateCanary)+';',
    'let state=0;',
    'export async function step(symbol){',
    'const old=state;state=model.next[old][symbol];return model.output[old][symbol];',
    '}'
  ].join('\n');
  const partition=partitionScoAsyncModule({
    path:'client.mjs',sourceType:'module',code:original
  },{seed:'sco-browser-sync-agent49',serverOnlyInitialization:true});
  assert.deepEqual(partition.names,['step']);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sco-browser-sync-'));
  /** @type {http.Server|null} */
  let server=null;
  try {
    const privateFile=path.join(root,'private.mjs');
    await atomicWrite(privateFile,original);
    const nativeModule=await import(pathToFileURL(privateFile).href);
    const servedSco=createScoHandler([partition.clientFile],{
      remoteMethods:bindScoModuleExports(partition,nativeModule),
      authorizeRead:request=>request.headers.cookie==='session=approved',
      authorizeRpc:request=>request.headers.cookie==='session=approved',
      authorizeOperation:(request,method,args)=>
        request.headers.cookie==='session=approved' &&
        method===partition.methodNames.step && args.length===1 &&
        typeof args[0]==='number' && Number.isInteger(args[0]) &&
        args[0]>=0 && args[0]<=1
    });

    const attacker=[
      binaryWords.toString(),
      searchSynchronizingWordDiversified.toString(),
      'import * as publicModule from "/obfs/client.mjs";',
      '(async()=>{',
      'const candidate=await searchSynchronizingWordDiversified({step:publicModule.step});',
      'document.getElementById("out").textContent=JSON.stringify({',
      '  word:candidate.word,steps:candidate.steps,resetExport:Object.hasOwn(publicModule,"reset")',
      '});',
      '})().catch(error=>{document.getElementById("out").textContent="ERROR:"+error.message;});'
    ].join('\n');

    const activeServer=http.createServer((request,response)=>{
      if(request.url==='/attack.html'){
        response.writeHead(200,{
          'content-type':'text/html; charset=utf-8',
          'set-cookie':'session=approved; Path=/; SameSite=Lax',
          'cache-control':'no-store'
        });
        response.end('<!doctype html><html><body><pre id="out">pending</pre>'+
          '<script type="module" src="/attacker.mjs"></script></body></html>');
      }else if(request.url==='/attacker.mjs'){
        response.writeHead(200,{'content-type':'text/javascript; charset=utf-8',
          'x-content-type-options':'nosniff','cache-control':'no-store'});
        response.end(attacker);
      }else {
        void servedSco(request,response);
      }
    });
    server=activeServer;
    /** @type {Promise<void>} */
    const ready=new Promise((resolve,reject)=>{
      activeServer.once('error',reject);
      activeServer.listen(0,'127.0.0.1',()=>resolve());
    });
    await ready;
    const address=activeServer.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;

    const unauthorizedSource=await fetch(origin+'/obfs/client.mjs');
    assert.equal(unauthorizedSource.status,403);
    const authorizedSource=await fetch(origin+'/obfs/client.mjs',{
      headers:{cookie:'session=approved'}
    });
    assert.equal(authorizedSource.status,200);
    const publicSource=await authorizedSource.text();
    assert.ok(!publicSource.includes(privateCanary));
    assert.ok(!publicSource.includes('model.next'));
    const unauthorizedRpc=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:partition.methodNames.step,args:[0]})
    });
    assert.equal(unauthorizedRpc.status,403);
    const browser=process.env.CHROMIUM_BIN??'chromium';
    const {stdout}=await promisify(execFile)(browser,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--user-data-dir='+path.join(root,'chromium-profile'),
      '--virtual-time-budget=30000','--dump-dom',origin+'/attack.html'
    ],{timeout:90000,maxBuffer:8*1024*1024,encoding:'utf8'});
    const observed=stdout.match(/<pre id="out">([^<]*)<\/pre>/u)?.[1];
    assert.ok(observed&&observed!=='pending','Chromium failed to run public SCO oracle: '+stdout.slice(0,1000));
    assert.ok(!observed.startsWith('ERROR:'),observed);
    const actual=JSON.parse(observed);
    assert.deepEqual(actual,{word:[0,0,0],steps:1656,resetExport:false});
    assert.ok(!stdout.includes(privateCanary));
    process.stdout.write('Chromium authenticated SCO step-only oracle: '+observed+'\n');
  }finally {
    if(server){
      const activeServer=server;
      /** @type {Promise<void>} */
      const closed=new Promise((resolve,reject)=>
        activeServer.close(error=>error?reject(error):resolve()));
      await closed;
    }
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={main};
