'use strict';

/**
 * Browser exact-source witness for the *real server-controlled handler*,
 * not obfuscateFiles({mode:'sco'}). Runs against a pinned candidate checked out
 * by source-observer-direct-validator.yml, and a separately fetched test file.
 */
const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createScoHandler}=require(path.join(process.cwd(),'src'));
const run=promisify(execFile);

/** @typedef {{path:string,sourceType:'module',code:string}} SourceFile */

/** @param {boolean} alias @returns {SourceFile[]} */
function filesFor(alias){
  return [
    {path:'logic.mjs',sourceType:'module',code:
      'const owner={secretField:57};'+
      'export function inspect(){return owner.secretField;}'},
    {path:'pure.mjs',sourceType:'module',code:
      'const record={privateField:73};'+
      'export const independent=record.privateField;'},
    {path:'observer.mjs',sourceType:'module',code:
      'import {inspect} from "./logic.mjs";'+
      'import {independent} from "./pure.mjs";'+
      (alias?'const indirect=inspect;':'')+
      'const target=document.createElement("div");'+
      'target.id='+(alias?'indirect':'inspect')+';'+
      'export const observed={source:target.id,value:inspect(),independent};'}
  ];
}

/** @param {string} moduleUrl @returns {string} */
function html(moduleUrl){
  return '<!doctype html><html><body><pre id="result">pending</pre>'+
    '<script type="module">import {observed} from "'+moduleUrl+'";'+
    'document.getElementById("result").textContent='+
    'btoa(JSON.stringify(observed));</script></body></html>';
}

/** @param {string} url @returns {Promise<{source:string,value:number,independent:number}>} */
async function browser(url){
  const {stdout,stderr}=await run(process.env.CHROMIUM_BIN||'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=2400','--dump-dom',url
  ],{timeout:25000,maxBuffer:3*1024*1024,encoding:'utf8'});
  const base64=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(base64,'Chromium failed SCO served ESM graph: '+
    stdout.slice(0,500)+'; '+stderr.slice(0,250));
  return JSON.parse(Buffer.from(base64,'base64').toString('utf8'));
}

/** @returns {Promise<void>} */
async function main(){
  const originals=new Map();
  const handlers=new Map();
  for(const alias of [false,true]){
    const label=alias?'alias':'direct';
    const files=filesFor(alias);
    originals.set(label,new Map(files.map(file=>[file.path,file.code])));
    handlers.set(label,createScoHandler(files,{
      closedWorld:true,routePrefix:'/sco-'+label+'/'
    }));
  }
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/', 'http://127.0.0.1').pathname;
    if(pathname.startsWith('/sco-direct/')){
      const handler=handlers.get('direct');
      if(handler)return handler(request,response);
    }
    if(pathname.startsWith('/sco-alias/')){
      const handler=handlers.get('alias');
      if(handler)return handler(request,response);
    }
    for(const label of ['direct','alias']){
      if(pathname==='/native-'+label+'/index.html'){
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        response.end(html('./observer.mjs'));return;
      }
      if(pathname==='/emitted-'+label+'/index.html'){
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        response.end(html('/sco-'+label+'/observer.mjs'));return;
      }
      if(pathname.startsWith('/native-'+label+'/')){
        const name=pathname.slice(('/native-'+label+'/').length);
        const code=originals.get(label)?.get(name);
        if(typeof code==='string'){
          response.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});
          response.end(code);return;
        }
      }
    }
    response.writeHead(404).end('missing');
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  /** @type {Array<{alias:boolean,nativeSource:string,servedSource:string,returnValue:number,positiveValue:number,servedFileChanges:Record<string,{changed:boolean,privatePropertyRenamed:boolean,bytes:number}>}>} */
  const observations=[];
  try{
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const base='http://127.0.0.1:'+address.port;
    for(const alias of [false,true]){
      const label=alias?'alias':'direct';
      const native=await browser(base+'/native-'+label+'/index.html');
      const served=await browser(base+'/emitted-'+label+'/index.html');
      assert.equal(native.value,57);
      assert.equal(served.value,57);
      assert.equal(native.independent,73);
      assert.equal(served.independent,73);
      assert.equal(native.source,'function inspect(){return owner.secretField;}');
      /** @type {Record<string,{changed:boolean,privatePropertyRenamed:boolean,bytes:number}>} */
      const servedFileChanges={};
      for(const filename of ['logic.mjs','pure.mjs','observer.mjs']){
        const response=await fetch(base+'/sco-'+label+'/'+filename);
        assert.equal(response.status,200,'SCO HTTP code for '+filename);
        const code=await response.text();
        const original=originals.get(label)?.get(filename);
        assert.equal(typeof original,'string');
        servedFileChanges[filename]={
          changed:code!==original,
          privatePropertyRenamed:filename==='pure.mjs'?
            !code.includes('privateField') && /_p[a-f0-9]+/u.test(code):
            filename==='logic.mjs'?
              !code.includes('secretField') && /_p[a-f0-9]+/u.test(code):
              false,
          bytes:Buffer.byteLength(code)
        };
      }
      observations.push({
        alias,nativeSource:native.source,servedSource:served.source,
        returnValue:served.value,positiveValue:served.independent,
        servedFileChanges
      });
    }
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
  console.log('SCO_HANDLER_DOM_ALIAS_CHROMIUM '+JSON.stringify(observations));
  assert.ok(observations.every(x=>x.nativeSource===x.servedSource),
    'SCO request-time client source differs from the original under real browser Element.id DOMString coercion');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
