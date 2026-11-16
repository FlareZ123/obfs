'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {ROOT,NAMES}=require('../examples/application-challenge/build.cjs');

const run=promisify(execFile);
const CASES=[[0,0],[0x12345678,8000],[0xffffffff,12000]];

/** @param {number} value @returns {number} */
function externalValue(value){
  let x=(value^0xa5a5a5a5)>>>0;
  x=Math.imul(x^(x>>>16),0x45d9f3b)>>>0;
  return (x^(x>>>16))>>>0;
}

/**
 * Serve exactly the compiler-generated COO modules and run the app as a real
 * ESM script under Chromium. This is a compatibility / public-source
 * retrieval regression, not an integrity or domain-lock claim.
 * @returns {Promise<void>}
 */
async function main(){
  const oldWindow=globalThis.window;
  globalThis.window={externalValue};
  const native=await import(pathToFileURL(path.join(ROOT,'before','app.mjs')).href);
  const expected=CASES.map(([seed,count])=>native.evaluate(seed,count));
  const html='<!doctype html><meta charset="utf-8"><body>'+
    '<script type="module">'+
    'import {evaluate} from "/app/app.mjs";'+
    'window.externalValue='+externalValue.toString()+';'+
    'const cases='+JSON.stringify(CASES)+';'+
    'const output=cases.map(([seed,count])=>evaluate(seed,count));'+
    'const pre=document.createElement("pre");'+
    'pre.id="out";pre.textContent=btoa(JSON.stringify(output));'+
    'document.body.append(pre);'+
    '</script></body>';
  const allowed=new Set(NAMES);
  const server=http.createServer(async(request,response)=>{
    if(request.method!=='GET'){response.writeHead(405);response.end();return;}
    if(request.url==='/'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(html);return;
    }
    const name=request.url?.startsWith('/app/')?request.url.slice('/app/'.length):'';
    if(!allowed.has(name)){
      response.writeHead(404);response.end();return;
    }
    const code=await fs.readFile(path.join(ROOT,'after',name),'utf8');
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(code);
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing test port');
    const origin='http://127.0.0.1:'+address.port;

    const protectedSource=await fetch(origin+'/app/engine.mjs');
    assert.equal(protectedSource.status,200);
    const leakedSource=await protectedSource.text();
    assert.equal(leakedSource,await fs.readFile(
      path.join(ROOT,'before','engine.mjs'),'utf8'));
    assert.ok(leakedSource.includes('Math.imul'));
    const denied=await fetch(origin+'/app/private-key.txt');
    assert.equal(denied.status,404);

    const chromium=process.env.CHROMIUM_BIN??'google-chrome';
    const {stdout}=await run(chromium,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=12000','--dump-dom',origin+'/'
    ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
    const encoded=stdout.match(/<pre id="out">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
    assert.ok(encoded,'Chromium did not complete COO ESM: '+stdout.slice(0,1500));
    const actual=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
    assert.deepEqual(actual,JSON.parse(JSON.stringify(expected)));
    process.stdout.write('APPLICATION_COO_CHROMIUM '+JSON.stringify({
      matchedCases:CASES.length,
      publicFiles:NAMES.length,
      originalProtectedSourceFetchedVerbatim:true,
      protectedSourceBytes:Buffer.byteLength(leakedSource)
    })+'\n');
  }finally{
    await new Promise((resolve,reject)=>server.close(
      error=>error?reject(error):resolve()));
    if(oldWindow===undefined)delete globalThis.window;
    else globalThis.window=oldWindow;
  }
}
if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={main};
