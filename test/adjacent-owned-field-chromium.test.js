'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const {spawnSync,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');
const {normalizePublicFields}=require('../sims/public-token-normalizer');

const runChrome=promisify(execFile);

/** @typedef {{path:string,code:string,sourceType:'module'}} Source */

/** @returns {Source[]} */
function fixture() {
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretValue:3,otherKey:5};'+
        'export const internalValue=state.secretValue;'},
    {path:'workerA.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";'+
        'function worker(param){const alias=param;return alias.secretValue+alias.otherKey;}'+
        'export const partial=worker(state);'},
    {path:'workerB.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";'+
        'const {secretValue:factor,otherKey}=state;export const partial=factor*otherKey;'},
    {path:'index.mjs',sourceType:'module',
      code:'import {state,internalValue} from "./state.mjs";'+
        'import {partial as a} from "./workerA.mjs";'+
        'import {partial as b} from "./workerB.mjs";'+
        'export const result=(+a)+(+b)+internalValue+state.secretValue;'}
  ];
}

test('adjacent own-data primitive four-file graph preserves real Chromium ESM results',async t=>{
  const chromium=process.env.CHROMIUM_BIN??'google-chrome';
  if(spawnSync(chromium,['--version'],{encoding:'utf8'}).status!==0) {
    t.skip('Chrome is unavailable; Node ESM parity is in the separate core regression');
    return;
  }
  const originals=fixture();
  const emitted=obfuscateFiles(originals,{mode:'coo',seed:'adjacent-primitive-browser',
    closedWorld:true,strings:false,identifiers:false,properties:true});
  assert.equal(emitted.crossFile.objects,1);
  assert.equal(emitted.crossFile.properties,2);
  /** @type {Map<string,string>} */
  const files=new Map();
  for(const file of originals)files.set('/native/'+file.path,file.code);
  for(const file of emitted.files) {
    assert.equal(typeof file.code,'string');
    files.set('/emitted/'+file.path,/** @type {string} */(file.code));
  }
  const normalized=normalizePublicFields(emitted.files.map(file=>({
    path:file.path,sourceType:/** @type {'module'} */('module'),code:String(file.code)
  })));
  assert.equal(normalized.properties,2);
  for(const file of normalized.files)files.set('/normalized/'+file.path,file.code);
  const html=[
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<script type="module">',
    'try {const m=await import("./index.mjs");',
    'const pre=document.createElement("pre");pre.id="result";',
    'pre.textContent=btoa(JSON.stringify(m.result));document.body.appendChild(pre);',
    '} catch(e) {const pre=document.createElement("pre");pre.id="failure";',
    'pre.textContent=String(e.stack||e);document.body.appendChild(pre);}',
    '</script></body></html>'
  ].join('\n');
  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    const url=new URL(request.url??'/', 'http://localhost');
    if(url.pathname.endsWith('/index.html')) {
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(html);
      return;
    }
    const body=files.get(url.pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(body);
  });
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const addr=server.address();
    if(!addr||typeof addr==='string')throw Error('Server did not return a listening address');
    const origin='http://127.0.0.1:'+addr.port;
    for(const lane of ['native','emitted','normalized']) {
      const {stdout}=await runChrome(chromium,[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=12000','--dump-dom',
        origin+'/'+lane+'/index.html'
      ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
      const text=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
      assert.ok(text,lane+' real-Chromium ESM failure: '+stdout.slice(0,1600));
      const value=JSON.parse(Buffer.from(text,'base64').toString('utf8'));
      assert.equal(value,29,lane+' Chromium ESM runtime parity');
    }
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
});
