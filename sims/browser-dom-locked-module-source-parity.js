'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {obfuscateFiles} = require('../src');
const run = promisify(execFile);

/** @type {'module'} */
const sourceType='module';
const observer =
  'const visible=document.querySelector("script#script-probe").textContent;' +
  'globalThis.result={value:8,sourceLength:visible.length};';
const inert='globalThis.result={value:8};';

/** @param {string} code @returns {string} */
function html(code){
  return '<!doctype html><html><body><pre id="result">pending</pre>' +
    '<script type="module" id="script-probe">'+code+'</script>' +
    '<script>window.addEventListener("load",()=>{' +
    'document.getElementById("result").textContent=' +
    'btoa(JSON.stringify(globalThis.result));});</script></body></html>';
}

/**
 * @param {string} target
 * @returns {Promise<{value:number,sourceLength?:number}>}
 */
async function browser(target){
  const {stdout,stderr}=await run(process.env.CHROMIUM_BIN||'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=1900','--dump-dom',target
  ],{timeout:25000,maxBuffer:2*1024*1024});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium source-lock page failed: '+stdout.slice(0,350)+
    '; stderr='+stderr.slice(0,350));
  return JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
}

/** @param {string} code @returns {string} */
function lock(code){
  const compiled=obfuscateFiles([{path:'entry.mjs',sourceType,code}],
    {mode:'coo',seed:'dom-locked-inline-module',strings:false,identifiers:false,
      properties:false,closedWorld:true,allowedHosts:['127.0.0.1']});
  const file=compiled.files[0];
  assert.ok(typeof file.code==='string');
  return file.code;
}

/** @returns {Promise<void>} */
async function main(){
  const lockedInert=lock(inert);
  /** @type {string|undefined} */
  let lockedObserved;
  try {
    lockedObserved=lock(observer);
  }catch(error){
    // Explicit refusal is a sound outcome for a source-observing program:
    // the authorized-host wrapper would change its observable bytes.
    assert.ok(error instanceof TypeError);
    assert.match(String(error),/Host locking cannot preserve observable source bytes/u);
  }
  const routes=new Map([
    ['/inert-native',{type:'text/html',body:html(inert)}],
    ['/inert-locked',{type:'text/html',body:html(lockedInert)}],
    ['/observed-native',{type:'text/html',body:html(observer)}]
  ]);
  if(lockedObserved!==undefined)
    routes.set('/observed-locked',{type:'text/html',body:html(lockedObserved)});
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/', 'http://127.0.0.1').pathname;
    const item=routes.get(pathname);
    if(!item){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':item.type+'; charset=utf-8',
      'Cache-Control':'no-store'});
    response.end(item.body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=/** @type {import('node:net').AddressInfo} */(server.address());
    const root='http://127.0.0.1:'+address.port;
    const inertNative=await browser(root+'/inert-native');
    const inertLocked=await browser(root+'/inert-locked');
    const observedNative=await browser(root+'/observed-native');
    assert.deepEqual(inertNative,{value:8});
    assert.deepEqual(inertLocked,inertNative,'Basic authorized host lock must preserve result');
    assert.deepEqual(observedNative,{value:8,sourceLength:observer.length});
    if(lockedObserved===undefined){
      console.log('DOM_LOCKED_MODULE_SOURCE '+JSON.stringify({
        inertNative,inertLocked,observedNative,refused:true,
        allowedHost:'127.0.0.1'
      }));
      return;
    }
    const observedLocked=await browser(root+'/observed-locked');
    const output={inertNative,inertLocked,observedNative,observedLocked,
      originalSourceBytes:Buffer.byteLength(observer),
      guardedSourceBytes:Buffer.byteLength(lockedObserved),
      allowedHost:'127.0.0.1',
      guardPresent:lockedObserved.includes('Unauthorized execution host')};
    console.log('DOM_LOCKED_MODULE_SOURCE '+JSON.stringify(output));
    assert.deepEqual(inertNative,{value:8});
    assert.deepEqual(inertLocked,inertNative,'Basic authorized host lock must preserve result');
    assert.deepEqual(observedNative,{value:8,sourceLength:observer.length});
    assert.equal(observedLocked.value,8,'Authorized host lock must execute');
    assert.ok(output.guardPresent&&lockedObserved.length>observer.length,
      'Verify the host-lock transformation actually injected executable code');
    assert.deepEqual(observedLocked,observedNative,
      'Authorized host lock must not change observable inline module source');
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
