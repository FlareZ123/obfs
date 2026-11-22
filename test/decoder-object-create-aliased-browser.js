'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * @param {string} mutation
 * @returns {SourceFile[]}
 */
function graph(mutation) {
  return [
    {path:'entry.mjs',sourceType:'module',code:[
      "import './mutator.mjs';",
      "import {payload} from './target.mjs';",
      "document.getElementById('out').textContent=payload;"
    ].join('\n')},
    {path:'mutator.mjs',sourceType:'module',code:mutation},
    {path:'target.mjs',sourceType:'module',
      code:'export const payload='+JSON.stringify('Z'.repeat(2048)+'P')+';'}
  ];
}

/**
 * Evaluate the original and emitted ESM graphs inside real Chromium, retaining
 * their exact cross-module order. Each graph uses an isolated HTTP origin.
 *
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<string>}
 */
async function runBrowser(files) {
  const server=http.createServer((request,response)=>{
    const filename=(request.url??'/').slice(1);
    if(!filename){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8',
        'content-security-policy':"default-src 'none'; script-src 'self'",
        'cache-control':'no-store'});
      response.end('<!doctype html><meta charset="utf-8"><pre id="out">pending</pre>'+
        '<script type="module" src="/entry.mjs"></script>');
      return;
    }
    const file=files.find(item=>item.path===filename);
    if(!file){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8',
      'cache-control':'no-store'});
    response.end(file.code);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'chromium',[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=5000','--dump-dom',
      'http://127.0.0.1:'+address.port+'/'
    ],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024,windowsHide:true});
    const match=stdout.match(/<pre id="out">([^<]*)<\/pre>/u);
    assert.ok(match,'Browser module output absent: '+stdout.slice(0,800));
    return match[1];
  } finally {
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

/** @returns {Promise<void>} */
async function main() {
  const fixtures=[
    {name:'first-class Object.create',safe:false,
      mutation:'const create=Object.create;'+
        'const box=create(null,{ref:{get(){return String.prototype}}});'+
        'box.ref.charCodeAt=()=>0;'},
    {name:'computed descriptor key',safe:false,
      mutation:'const key="ref";const descriptors={[key]:{get(){return String.prototype}}};'+
        'const box=Object.create(null,descriptors);box.ref.charCodeAt=()=>0;'},
    {name:'assigned descriptor map entry',safe:false,
      mutation:'const descriptors={};descriptors.ref={get(){return String.prototype}};'+
        'const box=Object.create(null,descriptors);box.ref.charCodeAt=()=>0;'},
    {name:'descriptor map member write through identifier alias',safe:false,
      mutation:'const descriptors={};const alias=descriptors;'+
        'alias.ref={get(){return String.prototype}};'+
        'const box=Object.create(null,descriptors);box.ref.charCodeAt=()=>0;'},
    {name:'descriptor map alias with harmless Number getter',safe:true,
      mutation:'const descriptors={};const alias=descriptors;'+
        'alias.ref={get(){return Number.prototype}};'+
        'const box=Object.create(null,descriptors);box.ref.unrelated=1;'},
    {name:'descriptor entry getter through member-read alias',safe:false,
      mutation:'const descriptors={ref:{}};const entry=descriptors.ref;'+
        'entry.get=function(){return String.prototype};'+
        'const box=Object.create(null,descriptors);box.ref.charCodeAt=()=>0;'},
    {name:'descriptor entry getter through member-read Number alias',safe:true,
      mutation:'const descriptors={ref:{}};const entry=descriptors.ref;'+
        'entry.get=function(){return Number.prototype};'+
        'const box=Object.create(null,descriptors);box.ref.unrelated=1;'},
    {name:'descriptor entry Object.assign getter alias',safe:false,
      mutation:'const descriptors={ref:{}};const entry=descriptors.ref;'+
        'Object.assign(entry,{get:function(){return String.prototype}});'+
        'const box=Object.create(null,descriptors);box.ref.charCodeAt=()=>0;'},
    {name:'descriptor entry Object.assign Number alias',safe:true,
      mutation:'const descriptors={ref:{}};const entry=descriptors.ref;'+
        'Object.assign(entry,{get:function(){return Number.prototype}});'+
        'const box=Object.create(null,descriptors);box.ref.unrelated=1;'},
    {name:'prebound prototype with invocation-time descriptor map',safe:false,
      mutation:'const maker=Object.create.bind(null,null);'+
        'const box=maker({ref:{get(){return String.prototype}}});'+
        'box.ref.charCodeAt=()=>0;'},
    {name:'prebound prototype with harmless Number getter',safe:true,
      mutation:'const maker=Object.create.bind(null,null);'+
        'const box=maker({ref:{get(){return Number.prototype}}});'+
        'box.ref.unrelated=1;'},
    {name:'unrelated String getter',safe:true,
      mutation:'const unused={get(){return String.prototype}};'+
        'const box=Object.create(null,{});box.unrelated=17;'}
  ];
  /** @type {Array<{case:string,emittedLiteralCount:number,outputLength:number}>} */
  const outcomes=[];
  for(const fixture of fixtures){
    const native=graph(fixture.mutation);
    const emitted=obfuscateFiles(native,{mode:'coo',strings:true,
      properties:false,identifiers:false,
      seed:'browser-object-create-alias/'+fixture.name});
    const target=emitted.files.find(file=>file.path==='target.mjs');
    assert.ok(target,'Expected emitted target module');
    assert.equal(target.metrics.literals,fixture.safe?1:0,
      fixture.name+' transform yield');
    const originalOutput=await runBrowser(native);
    const emittedOutput=await runBrowser(emitted.files);
    assert.equal(originalOutput,'Z'.repeat(2048)+'P',fixture.name);
    assert.equal(emittedOutput,originalOutput,fixture.name+' native/emitted parity');
    outcomes.push({case:fixture.name,emittedLiteralCount:target.metrics.literals,
      outputLength:emittedOutput.length});
  }
  process.stdout.write(JSON.stringify({browser:'Chromium',outcomes})+'\n');
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
