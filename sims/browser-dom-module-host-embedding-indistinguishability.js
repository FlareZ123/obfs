'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {obfuscateFiles} = require('../src');

const run = promisify(execFile);

/** @type {'module'} */
const sourceType='module';
const library =
  'function compute(input){const hiddenWorker=input+5;return hiddenWorker;}' +
  'export const answer=compute(3);';
const entry =
  'import {answer} from "./lib.mjs";' +
  'function local(){const privateNumber=answer;return privateNumber;}' +
  'const observed=document.documentElement.outerHTML;' +
  'globalThis.result={value:local(),sourceMatch:observed.includes("hidden"+"Worker")};';

/**
 * Two host variants receive exactly the same JS input graph. One includes a
 * non-executable source mirror for the imported external module.
 * @param {string} entryCode
 * @param {string|null} mirroredSource
 * @returns {string}
 */
function html(entryCode,mirroredSource){
  const mirror=mirroredSource===null?'':(
    '<script type="text/plain" id="source-mirror">'+mirroredSource+'</script>');
  return '<!doctype html><html><body><pre id="result">pending</pre>' +
    mirror+'<script id="entry" type="module">'+entryCode+'</script>' +
    '<script>window.addEventListener("load",()=>{' +
    'document.getElementById("result").textContent=' +
    'btoa(JSON.stringify(globalThis.result));});</script></body></html>';
}

/** @param {string} url @returns {Promise<{value:number,sourceMatch:boolean}>} */
async function browser(url){
  const {stdout,stderr}=await run(process.env.CHROMIUM_BIN||'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=2000','--dump-dom',url
  ],{timeout:25000,maxBuffer:2*1024*1024});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium ESM host page failed: '+stdout.slice(0,400)+
    '; stderr='+stderr.slice(0,400));
  return JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
}

/** @returns {Promise<void>} */
async function main(){
  const output=obfuscateFiles([
    {path:'entry.mjs',sourceType,code:entry},
    {path:'lib.mjs',sourceType,code:library}
  ],{mode:'coo',seed:'inline-module-host-embedding',strings:false,
    identifiers:true,properties:false,closedWorld:true});
  const entryResult=output.files.find(file=>file.path==='entry.mjs');
  const libraryResult=output.files.find(file=>file.path==='lib.mjs');
  assert.ok(entryResult&&libraryResult);
  assert.ok(typeof entryResult.code==='string');
  assert.ok(typeof libraryResult.code==='string');
  assert.ok(libraryResult.metrics.bindings>0);
  assert.ok(!libraryResult.code.includes('hiddenWorker'),
    'Emitted external module must actually rename the mirrored identifier');
  const routes=new Map();
  /** @type {Array<['external'|'mirrored',boolean]>} */
  const policies=[['external',false],['mirrored',true]];
  for(const [policy,mirrored] of policies){
    routes.set('/'+policy+'-native/index.html',
      {type:'text/html',body:html(entry,mirrored?library:null)});
    routes.set('/'+policy+'-native/lib.mjs',
      {type:'text/javascript',body:library});
    routes.set('/'+policy+'-emitted/index.html',
      {type:'text/html',body:html(entryResult.code,
        mirrored?libraryResult.code:null)});
    routes.set('/'+policy+'-emitted/lib.mjs',
      {type:'text/javascript',body:libraryResult.code});
  }
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/', 'http://127.0.0.1').pathname;
    const selected=routes.get(pathname);
    if(!selected){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':selected.type+'; charset=utf-8',
      'Cache-Control':'no-store'});
    response.end(selected.body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=/** @type {import('node:net').AddressInfo} */(server.address());
    const base='http://127.0.0.1:'+address.port;
    const externalNative=await browser(base+'/external-native/index.html');
    const externalEmitted=await browser(base+'/external-emitted/index.html');
    const mirroredNative=await browser(base+'/mirrored-native/index.html');
    const mirroredEmitted=await browser(base+'/mirrored-emitted/index.html');
    console.log('DOM_ESM_TWO_HOSTS '+JSON.stringify({
      sourceType,externalNative,externalEmitted,mirroredNative,mirroredEmitted,
      entryBindings:entryResult.metrics.bindings,
      libraryBindings:libraryResult.metrics.bindings,
      sameCompiledBytesInBothHosts:true
    }));
    assert.deepEqual(externalNative,{value:8,sourceMatch:false});
    assert.deepEqual(externalEmitted,externalNative,
      'External-only host does not observe imported module source through HTML');
    assert.deepEqual(mirroredNative,{value:8,sourceMatch:true});
    assert.deepEqual(mirroredEmitted,{value:8,sourceMatch:false},
      'Mirrored host demonstrates source-observation mismatch');
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
