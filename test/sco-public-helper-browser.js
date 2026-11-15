'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {pathToFileURL}=require('node:url');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');

/**
 * Real Chromium imports the compiler-generated ESM facade, executes two
 * explicitly public local helpers in the browser, and invokes a private
 * server-side helper only through a cookie-authorized RPC method.
 * @returns {Promise<void>}
 */
async function main(){
  const root=path.join(__dirname,'../examples/sco-public-helpers');
  const source=(await fs.readFile(path.join(root,'before','mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const result=partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:source
  },{
    seed:'sco-public-helpers-20261115-example',
    privateNames:['secret'],publicHelperNames:['normalizeInput','formatCount']
  });
  const golden=(await fs.readFile(path.join(root,'after','mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  assert.equal(result.clientFile.code,golden);
  assert.doesNotMatch(golden,/SCO_PUBLIC_HELPER_PRIVATE_CANARY|PRIVATE_KEY|privateFold/u);
  assert.match(golden,/function normalizeInput/u);
  assert.match(golden,/const formatCount/u);
  const original=await import(pathToFileURL(path.join(root,'before','mixed.mjs')).href);
  const remoteMethods=bindScoModuleExports(result,original);
  let calls=0;
  /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
  const counted=Object.create(null);
  for(const [name,fn] of Object.entries(remoteMethods)){
    counted[name]=(...args)=>{calls++;return fn(...args);};
  }
  const input='  Alpha  ';
  const expected=(await original.combined(input))+'|'+original.normalize('  Beta  ')+
    '|'+original.label('xyz');
  const page='<!doctype html><html><body><pre id="out">pending</pre>'+
    '<script type="module">import {combined,normalize,label} from "/obfs/mixed.mjs";'+
    'try{const value=await combined("  Alpha  ");'+
    'document.getElementById("out").textContent=value+"|"+normalize("  Beta  ")+"|"+label("xyz");}'+
    'catch(error){document.getElementById("out").textContent="failed:"+String(error);}' +
    '</script></body></html>';
  const handler=createScoHandler([result.clientFile],{
    remoteMethods:counted,
    authorizeRead:req=>req.headers.cookie==='session=allow',
    authorizeRpc:req=>req.headers.cookie==='session=allow',
    authorizeOperation:(req,method,args)=>req.headers.cookie==='session=allow'&&
      method===result.methodNames.secret&&args.length===1&&typeof args[0]==='string'
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
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing browser test port');
    const origin='http://127.0.0.1:'+address.port;
    assert.equal((await fetch(origin+'/obfs/mixed.mjs')).status,403);
    const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'chromium',[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=6000','--dump-dom',origin+'/'
    ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
    const observed=stdout.match(/<pre id="out">([^<]+)<\/pre>/u)?.[1];
    assert.equal(observed,expected,
      'Real Chromium mixed SCO helper behavior diverged: '+stdout.slice(-1800));
    assert.equal(calls,1);
    console.log('Chromium SCO mixed helper graph: public helpers local; private RPC authenticated');
  }finally{
    /** @type {Promise<void>} */
    const ended=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await ended;
  }
}

if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={main};
