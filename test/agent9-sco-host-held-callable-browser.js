'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createScoHandler}=require('../src');

const runBrowser=promisify(execFile);

/**
 * @param {string} modulePath
 * @returns {string}
 */
function pageFor(modulePath){
  return '<!doctype html><meta charset="utf-8">'+
    '<pre id="result"></pre><pre id="failure"></pre>'+
    '<script>'+
      'window.__observation={source:null};'+
      'window.queueMicrotask=function(callback){'+
        'var source=Function.prototype.toString.call(callback);'+
        'if(source.includes("hidden"))window.__observation.source=source;'+
      '};'+
    '</script>'+
    '<script type="module">(async function(){try{'+
      'await import('+JSON.stringify(modulePath)+');'+
      'var result={source:window.__observation.source,done:true};'+
      'document.getElementById("result").textContent=btoa(JSON.stringify(result));'+
    '}catch(error){document.getElementById("failure").textContent=String(error&&error.stack||error);}})();</script>';
}

/**
 * @param {string} origin
 * @param {string} pagePath
 * @returns {Promise<{source:string|null,done:boolean}>}
 */
async function observe(origin,pagePath){
  const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=2000','--dump-dom',origin+pagePath
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium did not produce SCO host-held source observation: '+stdout.slice(0,1800));
  return /** @type {{source:string|null,done:boolean}} */(
    JSON.parse(Buffer.from(encoded,'base64').toString('utf8'))
  );
}

/** @returns {Promise<void>} */
async function main(){
  const files=[
    {
      path:'entry.mjs',sourceType:'module',
      code:[
        "import {getCallback} from './helper.mjs';",
        'queueMicrotask(getCallback());'
      ].join('\n')
    },
    {
      path:'helper.mjs',sourceType:'module',
      code:[
        'function hidden(inputValue){return inputValue+1;}',
        'export function getCallback(){return hidden;}'
      ].join('\n')
    }
  ];
  /** @type {Map<string,{body:string,type:string}>} */
  const resources=new Map();
  resources.set('/native/entry.mjs',{body:files[0].code,type:'text/javascript; charset=utf-8'});
  resources.set('/native/helper.mjs',{body:files[1].code,type:'text/javascript; charset=utf-8'});
  resources.set('/native.html',{body:pageFor('/native/entry.mjs'),type:'text/html; charset=utf-8'});
  resources.set('/sco.html',{body:pageFor('/obfs/entry.mjs'),type:'text/html; charset=utf-8'});
  const scoHandler=createScoHandler(files,{closedWorld:true});
  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
    if(pathname.startsWith('/obfs/')){scoHandler(request,response);return;}
    const resource=resources.get(pathname);
    if(!resource){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':resource.type,'cache-control':'no-store'});
    response.end(resource.body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    const native=await observe(origin,'/native.html');
    const emitted=await observe(origin,'/sco.html');
    assert.equal(native.done,true);
    assert.equal(emitted.done,true);
    assert.equal(native.source,'function hidden(inputValue){return inputValue+1;}');
    assert.ok(emitted.source);
    assert.notEqual(emitted.source,native.source);
    assert.ok(!emitted.source.includes('inputValue'));
    process.stdout.write('SCO_CHROMIUM_HOST_HELD_CALLBACK '+JSON.stringify({
      nativeSource:native.source,emittedSource:emitted.source,
      sourceChanged:native.source!==emitted.source,callbackInvoked:false
    })+'\n');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main};
