'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @typedef {{name:string,files:ModuleFile[],expectedFields:number,expectedText:string}} Fixture */

/** @param {string} source @param {string} entry @returns {ModuleFile[]} */
function graph(source,entry) {
  return [
    {path:'state.mjs',sourceType:'module',code:source},
    {path:'main.mjs',sourceType:'module',code:entry}
  ];
}

/** @returns {Fixture[]} */
function fixtures() {
  const root=path.join(__dirname,'..','examples','imported-constant-key','before');
  return [
    {name:'published',expectedFields:2,expectedText:'11 12',
      files:['state.mjs','main.mjs'].map(name=>({path:name,sourceType:'module',
        code:readFileSync(path.join(root,name),'utf8')}))},
    {name:'browser-host-api',expectedFields:1,expectedText:'24',
      files:graph('export const key="secretField";export const bag={secretField:23};',
        'import {key,bag} from "./state.mjs";'+
        'window.hostApi.accept(bag[key]+Number(window.hostApi.fieldKey===key));')},
    {name:'named-export-key',expectedFields:1,expectedText:'24',
      files:[
        {path:'state.mjs',sourceType:'module',code:
          'export const bag={secretField:23};'},
        {path:'keys.mjs',sourceType:'module',code:
          'const privateKey="secretField";export {privateKey as publicKey};'},
        {path:'main.mjs',sourceType:'module',code:
          'import {bag} from "./state.mjs";import {publicKey} from "./keys.mjs";'+
          'window.hostApi.accept(bag[publicKey]+Number(window.hostApi.fieldKey===publicKey));'}
      ]},
    {name:'named-export-mutable',expectedFields:0,expectedText:'9',
      files:[
        {path:'state.mjs',sourceType:'module',code:
          'export const bag={secretField:9};'},
        {path:'keys.mjs',sourceType:'module',code:
          'let privateKey="secretField";export {privateKey as publicKey};'},
        {path:'main.mjs',sourceType:'module',code:
          'import {bag} from "./state.mjs";import {publicKey} from "./keys.mjs";'+
          'window.hostApi.accept(bag[publicKey]);'}
      ]},
    {name:'named-export-source',expectedFields:0,expectedText:'true:8',
      files:[
        {path:'state.mjs',sourceType:'module',code:
          'export const bag={secretField:8};'},
        {path:'keys.mjs',sourceType:'module',code:
          'const privateKey="toString";export {privateKey as publicKey};'},
        {path:'main.mjs',sourceType:'module',code:
          'import {bag} from "./state.mjs";import {publicKey} from "./keys.mjs";'+
          'function observe(){return bag.secretField;}'+
          'window.hostApi.accept(observe[publicKey]().includes("secretField")+":"+bag.secretField);'}
      ]},
    {name:'named-owner-key-earlier',expectedFields:1,expectedText:'24',
      files:graph('const hidden="secretField";export {hidden as key};'+
          'export const bag={secretField:23};',
        'import {bag,key} from "./state.mjs";'+
          'window.hostApi.accept(bag[key]+Number(window.hostApi.fieldKey===key));')},
    {name:'named-owner-key-later',expectedFields:0,expectedText:'24',
      files:graph('export const bag={secretField:23};'+
          'const hidden="secretField";export {hidden as key};',
        'import {bag,key} from "./state.mjs";'+
          'window.hostApi.accept(bag[key]+Number(window.hostApi.fieldKey===key));')},
    {name:'named-owner-cycle-earlier',expectedFields:1,expectedText:'15',
      files:graph('import {probe} from "./main.mjs";const hidden="secretField";'+
          'export {hidden as key};export const bag={secretField:15};console.log(probe());',
        'import {bag,key} from "./state.mjs";export function probe(){return bag[key];}')},
    {name:'named-owner-cycle-tdz',expectedFields:0,expectedText:'ReferenceError:15',
      files:graph('import {probe} from "./main.mjs";export const bag={secretField:15};'+
          'let early="none";try{probe();}catch(error){early=error.name;}'+
          'const hidden="secretField";export {hidden as key};'+
          'window.hostApi.accept(early+":"+probe());',
        'import {bag,key} from "./state.mjs";export function probe(){return bag[key];}')},
    {name:'esm-cycle-safe',expectedFields:1,expectedText:'15',
      files:graph('import {probe} from "./main.mjs";export const key="secretField";'+
        'export const bag={secretField:15};console.log(probe());',
        'import {bag,key} from "./state.mjs";export function probe(){return bag[key];}')},
    {name:'esm-cycle-refused',expectedFields:0,expectedText:'15',
      files:graph('import {probe} from "./main.mjs";export const bag={secretField:15};'+
        'export const key="secretField";console.log(probe());',
        'import {bag,key} from "./state.mjs";export function probe(){return bag[key];}')},
    {name:'unknown-host-key',expectedFields:0,expectedText:'9',
      files:graph('export const bag={secretField:9};',
        'import {bag} from "./state.mjs";'+
        'window.hostApi.accept(bag[window.hostApi.fieldKey]);')},
    {name:'function-source',expectedFields:0,expectedText:'true:8',
      files:graph('export const key="toString";export const bag={secretField:8};',
        'import {bag,key} from "./state.mjs";'+
        'function observe(){return bag.secretField;}'+
        'window.hostApi.accept(observe[key]().includes("secretField")+":"+bag.secretField);')},
    {name:'error-stack',expectedFields:0,expectedText:'true:8',
      files:graph('export const key="stack";export const bag={secretField:8};',
        'import {bag,key} from "./state.mjs";const error=new Error("test");'+
        'window.hostApi.accept(error[key].includes("main.mjs")+":"+bag.secretField);')}
  ];
}

/** @param {string} binary @param {string} url @returns {Promise<string>} */
async function runBrowser(binary,url) {
  const args=['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=5000','--dump-dom',url];
  const {stdout}=await promisify(execFile)(binary,args,{
    timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'
  });
  const match=stdout.match(/<pre id="answer">([^<]*)<\/pre>/u);
  assert.ok(match,'Browser failed to report module result: '+stdout.slice(0,1400));
  return match[1];
}

/**
 * Run real browser-hosted native and emitted modules under a restrictive CSP
 * without any browser instrumentation or eval privileges in the module code.
 * @param {string} [binary]
 * @returns {Promise<{cases:number,positive:number,refused:number,comparisons:number}>}
 */
async function compareChrome(binary=process.env.CHROMIUM_BIN??'chromium') {
  const cases=fixtures();
  /** @type {Map<string,string>} */
  const contents=new Map();
  let positive=0,refused=0;
  for(const item of cases) {
    const transformed=obfuscateFiles(item.files,{mode:'coo',closedWorld:true,
      seed:'imported-key-browser/'+item.name,strings:false,identifiers:false});
    assert.equal(transformed.crossFile.properties,item.expectedFields,item.name);
    if(item.expectedFields)positive++;else refused++;
    for(const file of item.files)contents.set('/'+item.name+'/native/'+file.path,file.code);
    for(const file of transformed.files) {
      if(typeof file.code!=='string')throw new TypeError('ESM source expected');
      contents.set('/'+item.name+'/obfuscated/'+file.path,file.code);
    }
  }
  const hostInit=[
    'globalThis.hostApi={fieldKey:"secretField",',
    'accept(value){document.getElementById("answer").textContent=String(value)}};',
    'const prior=console.log;',
    'console.log=function(...items){',
    'document.getElementById("answer").textContent=items.map(String).join(" ");',
    'Reflect.apply(prior,console,items)};'
  ].join('');
  contents.set('/host-init.js',hostInit);
  for(const item of cases)for(const variant of ['native','obfuscated']) {
    const prefix='/'+item.name+'/'+variant;
    contents.set(prefix+'.html','<!doctype html><meta charset="utf-8">'+
      '<pre id="answer">pending</pre>'+
      '<script src="/host-init.js"></script>'+
      '<script type="module" src="'+prefix+'/main.mjs"></script>');
  }
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/', 'http://127.0.0.1').pathname;
    const body=contents.get(pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    response.setHeader('content-security-policy',
      "default-src 'none'; script-src 'self'; connect-src 'self'");
    response.setHeader('content-type',pathname.endsWith('.html')?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8');
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const host='http://127.0.0.1:'+address.port;
    let comparisons=0;
    for(const item of cases) {
      const original=await runBrowser(binary,host+'/'+item.name+'/native.html');
      const compiled=await runBrowser(binary,host+'/'+item.name+'/obfuscated.html');
      assert.equal(original,item.expectedText,'native '+item.name);
      assert.equal(compiled,original,'compiled '+item.name);
      comparisons++;
    }
    return {cases:cases.length,positive,refused,comparisons};
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)compareChrome().then(result=>console.log(JSON.stringify(result,null,2)))
  .catch(error=>{console.error(error?.stack??error);process.exitCode=1;});

module.exports={compareChrome,fixtures};
