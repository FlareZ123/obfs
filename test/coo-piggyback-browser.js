'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {buildSample}=require('../examples/coo-piggyback/build.cjs');

/** @typedef {{requests:string[],signature:string,html:string}} BrowserResult */

/**
 * Test real browser module evaluation with the exact emitted two-file sample.
 * The static server exposes only the original or emitted modules by path.
 * @param {string} variant
 * @param {string} chromium
 * @returns {Promise<BrowserResult>}
 */
async function runBrowser(variant,chromium){
  const root=path.resolve(__dirname,'../examples/coo-piggyback',variant);
  /** @type {string[]} */
  const requests=[];
  const html='<!doctype html><html><head><meta charset="utf-8"></head><body><div id="out">loading</div>'+
    '<script type="module">import {message,render} from "/app.mjs";'+
    'const value=message();let codes="";for(let i=0;i<value.length;i++)codes+=value.charCodeAt(i).toString(16)+",";'+
    'document.getElementById("out").textContent=codes+"/"+render(19);</script></body></html>';
  const server=http.createServer((req,res)=>{
    const requestPath=req.url??'';
    if(requestPath.endsWith('.mjs')){
      requests.push(requestPath);
      if(!['/app.mjs','/constants.mjs'].includes(requestPath)){
        res.writeHead(404);res.end();return;
      }
      res.writeHead(200,{'content-type':'text/javascript; charset=utf-8',
        'cache-control':'no-store'});
      res.end(fs.readFileSync(path.join(root,requestPath.slice(1))));
      return;
    }
    if(requestPath==='/'){
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      res.end(html);return;
    }
    res.writeHead(404);res.end();
  });
  try{
    /** @type {Promise<void>} */
    const listening=new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve());
    });
    await listening;
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const args=['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=4000',
      '--dump-dom','http://127.0.0.1:'+address.port+'/'];
    const {stdout}=await promisify(execFile)(chromium,args,
      {timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
    const match=stdout.match(/<div id="out">([^<]+)<\/div>/);
    assert.ok(match,'Browser did not run the ESM script: '+stdout.slice(-400));
    assert.notEqual(match[1],'loading');
    return {requests,signature:match[1],html:stdout};
  } finally {
    server.closeAllConnections();
    /** @type {Promise<void>} */
    const closed=new Promise(resolve=>server.close(()=>resolve()));
    await closed;
  }
}

async function main(){
  const sample=buildSample(true);
  assert.equal(sample.transformed,true);
  const chromium=process.env.CHROMIUM_BIN??'chromium';
  const original=await runBrowser('before',chromium);
  const transformed=await runBrowser('after',chromium);
  assert.equal(transformed.signature,original.signature);
  assert.deepEqual(original.requests.sort(),['/app.mjs','/constants.mjs']);
  assert.deepEqual(transformed.requests.sort(),['/app.mjs','/constants.mjs']);
  const digest=original.signature.length;
  console.log(JSON.stringify({status:'PASS',chromium,sourceModules:2,
    emittedModules:2,exactBrowserSignature:true,signatureCharacters:digest,
    nativeRequests:original.requests,emittedRequests:transformed.requests},null,2));
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

module.exports={runBrowser};
