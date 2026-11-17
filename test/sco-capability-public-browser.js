'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {pathToFileURL}=require('node:url');
const {createHmac,createHash,randomBytes}=require('node:crypto');
const {atomicWrite}=require('../src/atomic');
const {
  createScoHandler,partitionScoAsyncModule,bindScoModuleExports,
  createScoCapabilityScope,createScoPrivateHandles
}=require('../src');

const INPUTS=/** @type {number[]} */ ([0,1,1,0,1,0,0,1,1,1,0,1]);

/**
 * Run an actual Chromium public-ESM client with an HttpOnly cookie and a
 * private per-principal state machine. Browser DevTools may observe every
 * response, but the 256-bit HMAC key and private module stay on the server.
 * This is a compatibility/authentication test, not a browser tamper proof.
 *
 * @returns {Promise<void>}
 */
async function main(){
  const key=randomBytes(32);
  const secret=key.toString('hex');
  const canary='browser-private-capability-key-never-published';
  const globals=/** @type {Record<string,unknown>} */ (/** @type {unknown} */ (globalThis));
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sco-capability-browser-'));
  const source=[
    "import {createHmac} from 'node:crypto';",
    "const secret=Buffer.from("+JSON.stringify(secret)+",'hex');",
    'const handles=globalThis.__SCO_BROWSER_PRIVATE_HANDLES__;',
    'const canary='+JSON.stringify(canary)+';',
    'export async function begin(){return handles.issue({counter:0});}',
    'export async function step(token,input){',
    ' if(input!==0&&input!==1)throw TypeError("input");',
    ' return handles.use(token,record=>{',
    "  const result=createHmac('sha256',secret).update(String(record.counter++)).update(':').update(String(input)).digest('hex');",
    '  return result;',
    ' });',
    '}',
    'export async function close(token){return handles.revoke(token);}'
  ].join('\n');
  const scope=createScoCapabilityScope(request=>
    request.headers.cookie==='session=approved'?'principal-A':'unverified');
  const handles=createScoPrivateHandles(scope.currentPrincipal);
  /** @type {http.Server|undefined} */let server;
  try{
    const privatePath=path.join(root,'private.mjs');
    await atomicWrite(privatePath,source);
    globals.__SCO_BROWSER_PRIVATE_HANDLES__=handles;
    const remote=await import(pathToFileURL(privatePath).href);
    delete globals.__SCO_BROWSER_PRIVATE_HANDLES__;
    const partition=partitionScoAsyncModule({
      path:'browser-public.mjs',sourceType:'module',code:source
    },{seed:'capability-browser-2026-11-17',serverOnlyInitialization:true});
    const {begin,step,close}=partition.methodNames;
    const facade=partition.clientFile.code;
    assert.doesNotMatch(facade,/browser-private-capability-key-never-published|createHmac/u);
    assert.equal(facade.includes(secret),false);
    const sha256=createHash('sha256').update(facade).digest('hex');
    const page=[
      '<!doctype html><meta charset="utf-8"><body><pre id="out">pending</pre>',
      '<script type="module">',
      'import {begin,step,close} from "/obfs/browser-public.mjs";',
      'try{',
      ' const handle=await begin();',
      ' const samples='+JSON.stringify(INPUTS)+';',
      ' const results=[];',
      ' for(const symbol of samples)results.push(await step(handle,symbol));',
      ' const revoked=await close(handle);',
      ' document.getElementById("out").textContent=btoa(JSON.stringify({',
      '  results,revoked,tokenShape:/^[A-Za-z0-9_-]{43}$/.test(handle)',
      ' }));',
      '}catch(error){',
      ' document.getElementById("out").textContent="error:"+String(error);',
      '}',
      '</script></body>'
    ].join('\n');
    const handler=createScoHandler([partition.clientFile],{
      remoteMethods:bindScoModuleExports(partition,remote),
      publicPaths:['browser-public.mjs'],
      authorizeRead:request=>request.headers.cookie==='session=approved',
      authorizeRpc:request=>request.headers.cookie==='session=approved',
      authorizeOperation:(request,method,args)=>{
        if(request.headers.cookie!=='session=approved')return false;
        if(method===begin)return args.length===0;
        if(method===close)return args.length===1&&typeof args[0]==='string';
        return method===step&&args.length===2&&
          typeof args[0]==='string'&&(args[1]===0||args[1]===1);
      },
      runRpcIsolated:scope.runRpcIsolated
    });
    server=http.createServer((request,response)=>{
      if(request.method==='GET'&&request.url==='/'){
        response.writeHead(200,{
          'content-type':'text/html; charset=utf-8',
          'set-cookie':'session=approved; Path=/; HttpOnly; SameSite=Strict',
          'cache-control':'no-store'
        });
        response.end(page);return;
      }
      handler(request,response);
    });
    const running=server;
    await new Promise(resolve=>running.listen(0,'127.0.0.1',()=>resolve(undefined)));
    const address=running.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    assert.equal((await fetch(origin+'/obfs/browser-public.mjs')).status,403);
    const deniedRpc=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:begin,args:[]})
    });
    assert.equal(deniedRpc.status,403);
    const command=process.env.CHROMIUM_BIN??'google-chrome';
    const {stdout}=await promisify(execFile)(command,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=15000','--dump-dom',origin+'/'
    ],{timeout:60000,maxBuffer:4*1024*1024,encoding:'utf8'});
    const encoded=stdout.match(/<pre id="out">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
    assert.ok(encoded,'Browser module/RPC did not complete: '+stdout.slice(-2000));
    const observed=/** @type {{results:string[],revoked:boolean,tokenShape:boolean}} */ (
      JSON.parse(Buffer.from(encoded,'base64').toString('utf8')));
    assert.equal(observed.revoked,true);
    assert.equal(observed.tokenShape,true);
    let counter=0;
    const expected=INPUTS.map(input=>createHmac('sha256',key)
      .update(String(counter++)).update(':').update(String(input)).digest('hex'));
    assert.deepEqual(observed.results,expected);
    console.log(JSON.stringify({
      browser:command,generatedPublicSha256:sha256,
      authenticatedRpcCalls:INPUTS.length+2,
      matchedOutputs:INPUTS.length,unauthorizedGetStatus:403,
      unauthorizedRpcStatus:403,privateKeyAbsentFromPublic:true,
      handleRevoked:true,httpOnlySessionCookie:true
    }));
  }finally{
    delete globals.__SCO_BROWSER_PRIVATE_HANDLES__;
    if(server){
      const running=server;
      await new Promise((resolve,reject)=>
        running.close(error=>error?reject(error):resolve(undefined)));
    }
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={main};
