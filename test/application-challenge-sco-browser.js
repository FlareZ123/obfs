'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {startServer}=require('../examples/application-challenge/sco-server.cjs');

const run=promisify(execFile);
const CASES=[[17,8000],[0xffffffff,12000],[0,0]];

/** @param {http.Server} server @returns {Promise<string>} */
async function listen(server){
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Missing port');
  return 'http://127.0.0.1:'+address.port;
}

/** @param {http.Server} server @returns {Promise<void>} */
async function close(server){
  await new Promise((resolve,reject)=>server.close(
    error=>error?reject(error):resolve()));
}

/**
 * Exercise the generated SCO facade inside an actual headless Chromium tab.
 * The test-only same-origin proxy authenticates source/RPC requests to the
 * backend; it is not a production credential distribution recommendation.
 * @returns {Promise<void>}
 */
async function main(){
  const previous=globalThis.window;
  const backing=await startServer({token:'browser-fixture-token-20261116'});
  const {origin,token,native}=backing;
  const html='<!doctype html><meta charset="utf-8"><body>'+
    '<script type="module">'+
    'import {evaluateRemote} from "/obfs/sco-before/api.mjs";'+
    'const cases='+JSON.stringify(CASES)+';'+
    'const results=await Promise.all(cases.map(([seed,count])=>evaluateRemote(seed,count)));'+
    'const pre=document.createElement("pre");'+
    'pre.id="out";pre.textContent=btoa(JSON.stringify(results));document.body.append(pre);'+
    '</script></body>';
  const proxy=http.createServer(async (request,response)=>{
    try{
      if(request.method==='GET'&&request.url==='/'){
        response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
        response.end(html);
        return;
      }
      if(!['/obfs/sco-before/api.mjs','/obfs/rpc'].includes(request.url??'')){
        response.writeHead(404);response.end();return;
      }
      /** @type {Buffer[]} */
      const chunks=[];
      for await (const chunk of request)chunks.push(Buffer.from(chunk));
      const upstream=await fetch(origin+request.url,{
        method:request.method,
        headers:{'x-demo-token':token,
          'content-type':request.headers['content-type']??'application/json'},
        body:request.method==='POST'?Buffer.concat(chunks):undefined
      });
      response.writeHead(upstream.status,{
        'content-type':upstream.headers.get('content-type')??'application/json',
        'cache-control':'no-store'
      });
      response.end(Buffer.from(await upstream.arrayBuffer()));
    }catch(error){
      response.writeHead(502);
      response.end('Browser fixture relay error: '+String(error));
    }
  });
  try{
    const publicOrigin=await listen(proxy);
    const chromium=process.env.CHROMIUM_BIN??'google-chrome';
    const {stdout}=await run(chromium,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=12000','--dump-dom',publicOrigin+'/'
    ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
    const encoded=stdout.match(/<pre id="out">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
    assert.ok(encoded,'Chromium did not complete private SCO RPC: '+stdout.slice(0,1800));
    const actual=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
    const expected=await Promise.all(CASES.map(async ([seed,count])=>
      JSON.parse(JSON.stringify(await native(seed,count)))));
    assert.deepEqual(actual,expected);
    process.stdout.write('APPLICATION_SCO_CHROMIUM '+JSON.stringify({
      browser:chromium,cases:CASES.length,matched:CASES.length,
      publicModule:'/obfs/sco-before/api.mjs',
      unauthorizedPrivatePathsStillNotPublished:true
    })+'\n');
  }finally{
    await close(proxy);
    await close(backing.server);
    if(previous===undefined)delete globalThis.window;
    else globalThis.window=previous;
  }
}
if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={main};
