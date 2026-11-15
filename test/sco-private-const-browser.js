'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {pathToFileURL}=require('node:url');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');

const ROOT=path.join(__dirname,'../examples/sco-private-const');

/**
 * Real Chromium obtains an HttpOnly same-origin cookie from the test server,
 * loads the public facade as an ESM module, then calls the server-private
 * HMAC through its authenticated RPC method. The cookie is a test credential.
 * An attacker with a valid credential can still relay the protected function.
 * @returns {Promise<void>}
 */
async function main(){
  const source=(await fs.readFile(path.join(ROOT,'before','mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const result=partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:source
  },{seed:'sco-private-const-20261115',privateNames:['protectedDigest']});
  assert.ok(!result.clientFile.code.includes('SCO_SERVER_ONLY_HMAC'));
  const original=await import(pathToFileURL(path.join(ROOT,'before','mixed.mjs')).href);
  const remoteMethods=bindScoModuleExports(result,original);
  const expected=await original.run('  Alpha  ');
  const page='<!doctype html><html><body><pre id="out">pending</pre>'+
    '<script type="module">'+
    'import {run,normalize} from "/obfs/mixed.mjs";'+
    'try{const value=await run("  Alpha  ");'+
    'document.getElementById("out").textContent=value+":"+normalize("  Beta  ");}'+
    'catch(error){document.getElementById("out").textContent="failed:"+String(error);}' +
    '</script></body></html>';
  const handler=createScoHandler([result.clientFile],{
    remoteMethods,
    authorizeRead:req=>req.headers.cookie==='session=allow',
    authorizeRpc:req=>req.headers.cookie==='session=allow',
    authorizeOperation:(req,method,args)=>
      req.headers.cookie==='session=allow' &&
      method===result.methodNames.protectedDigest &&
      args.length===1 && typeof args[0]==='string'
  });
  const server=http.createServer((request,response)=>{
    if(request.url==='/'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8',
        'set-cookie':'session=allow; Path=/; HttpOnly; SameSite=Strict',
        'cache-control':'no-store'});
      response.end(page);return;
    }
    handler(request,response);
  });
  /** @type {Promise<void>} */
  const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await ready;
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing browser test port');
    const origin='http://127.0.0.1:'+address.port;
    const unauthorized=await fetch(origin+'/obfs/mixed.mjs');
    assert.equal(unauthorized.status,403);
    const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'chromium',[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=6000','--dump-dom',origin+'/'
    ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
    const observed=stdout.match(/<pre id="out">([^<]+)<\/pre>/u)?.[1];
    assert.equal(observed,expected+':beta',
      'Actual Chromium authenticated private-const RPC differs: '+stdout.slice(-2000));
    console.log('Chromium SCO private module constant remained server-only; RPC matched native HMAC');
  } finally {
    /** @type {Promise<void>} */
    const ended=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await ended;
  }
}

if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={main};
