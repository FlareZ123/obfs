'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const run=promisify(execFile);

/** @type {'module'} */
const sourceType='module';
const entry='import {readDocument} from "./reader.mjs";'+
  'function local(){const owner={secretToken:8};return owner.secretToken;}'+
  'const observed=readDocument(document);'+
  'globalThis.result={value:local(),sourceMatch:observed.includes("secret"+"Token")};';

/** @param {string} script @returns {string} */
function html(script){
  return '<!doctype html><html><body><pre id="result">pending</pre>'+
    '<script id="probe" type="module">'+script+'</script>'+
    '<script>window.addEventListener("load",()=>{' +
    'document.getElementById("result").textContent='+ 
    'btoa(JSON.stringify(globalThis.result));});</script></body></html>';
}

/** @param {string} url @returns {Promise<{value:number,sourceMatch:boolean}>} */
async function browser(url){
  const {stdout,stderr}=await run(process.env.CHROMIUM_BIN||'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=1900','--dump-dom',url
  ],{timeout:25000,maxBuffer:2*1024*1024});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Cross-file ESM browser did not execute: '+stdout.slice(0,400)+
    '; stderr='+stderr.slice(0,300));
  return JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
}

/** @returns {Promise<void>} */
async function main(){
  const cases=[
    {label:'delegated-benign-title',sourceVisible:false,
      reader:'export function readDocument(d){return d.title;}'},
    {label:'delegated-source-outer-html',sourceVisible:true,
      reader:'export function readDocument(d){return d.documentElement.outerHTML;}'}
  ];
  /** @type {Map<string,{type:string,body:string}>} */
  const routes=new Map();
  const variants=[];
  for(const sample of cases){
    const output=obfuscateFiles([
      {path:'entry.mjs',sourceType,code:entry},
      {path:'reader.mjs',sourceType,code:sample.reader}
    ],{mode:'coo',seed:'interfile-dom-private-key/'+sample.label,
      closedWorld:true,properties:true,strings:false,identifiers:false});
    const emitEntry=output.files.find(file=>file.path==='entry.mjs');
    const emitReader=output.files.find(file=>file.path==='reader.mjs');
    assert.ok(emitEntry&&emitReader);
    assert.ok(typeof emitEntry.code==='string');
    assert.ok(typeof emitReader.code==='string');
    variants.push({sample,entryMetrics:emitEntry.metrics,readerMetrics:emitReader.metrics});
    /** @type {Array<['native'|'emitted',string,string]>} */
    const deployments=[
      ['native',entry,sample.reader],
      ['emitted',emitEntry.code,emitReader.code]
    ];
    for(const [kind,entryCode,readerCode] of deployments){
      const prefix='/'+sample.label+'/'+kind;
      routes.set(prefix+'/index.html',{type:'text/html',body:html(entryCode)});
      routes.set(prefix+'/reader.mjs',{type:'text/javascript',body:readerCode});
    }
  }
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/', 'http://127.0.0.1').pathname;
    const found=routes.get(pathname);
    if(!found){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':found.type+'; charset=utf-8',
      'Cache-Control':'no-store'});
    response.end(found.body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  /** @type {string[]} */
  const mismatches=[];
  try {
    const address=/** @type {import('node:net').AddressInfo} */(server.address());
    const root='http://127.0.0.1:'+address.port;
    for(const {sample,entryMetrics,readerMetrics} of variants){
      const prefix='/'+sample.label;
      const native=await browser(root+prefix+'/native/index.html');
      const emitted=await browser(root+prefix+'/emitted/index.html');
      console.log('DOM_CROSSFILE_DELEGATED '+JSON.stringify({
        label:sample.label,sourceVisible:sample.sourceVisible,
        entryMetrics,readerMetrics,native,emitted
      }));
      assert.deepEqual(native,{value:8,sourceMatch:sample.sourceVisible});
      assert.ok(entryMetrics.properties>0,
        'The source-reflected inline importer must exhibit positive private-key rewriting');
      if(emitted.value!==native.value||emitted.sourceMatch!==native.sourceMatch)
        mismatches.push(sample.label);
    }
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }
  assert.deepEqual(mismatches,['delegated-source-outer-html'],
    'Only the cross-file delegated source reader should violate parity');
  assert.deepEqual(mismatches,[],
    'Cross-file delegated HTML source reader must preserve the importer private key spelling');
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
