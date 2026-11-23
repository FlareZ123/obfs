'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');

const html=[
  '<!doctype html><html><body><pre id="out">pending</pre><script type="module">',
  'try {',
  '  const sourceProbe=function sourceProbe(){const privateLocal=13;return privateLocal;};',
  '  const expectedSource=Function.prototype.toString.call(sourceProbe);',
  '  const originalDescriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
  '  const originalOwnDescriptor=Object.getOwnPropertyDescriptor(localStorage,"setItem");',
  '  if(!originalDescriptor||typeof originalDescriptor.value!=="function")throw Error("native Storage.prototype.setItem descriptor unavailable");',
  '  const nativeSetItem=originalDescriptor.value;',
  '  nativeSetItem.call(localStorage,"native-direct",sourceProbe);',
  '  const directSource=localStorage.getItem("native-direct");',
  '  let ownOverrideSupported=false;',
  '  let ownReference=false;',
  '  let ownStored=null;',
  '  let ownError=null;',
  '  let ownSaved;',
  '  try {',
  '    Object.defineProperty(localStorage,"setItem",{configurable:true,writable:true,value:function(key,value){ownSaved=value;}});',
  '    ownOverrideSupported=Object.hasOwn(localStorage,"setItem");',
  '    localStorage.setItem("own-shadow",sourceProbe);',
  '    ownReference=ownSaved===sourceProbe;',
  '    ownStored=localStorage.getItem("own-shadow");',
  '  } catch(error) { ownError=String(error); }',
  '  finally {',
  '    if(originalOwnDescriptor)Object.defineProperty(localStorage,"setItem",originalOwnDescriptor);',
  '    else delete localStorage.setItem;',
  '  }',
  '  let prototypePatchSupported=false;',
  '  let prototypeReference=false;',
  '  let prototypeStored=null;',
  '  let prototypeError=null;',
  '  let prototypeSaved;',
  '  let capturedSource=null;',
  '  try {',
  '    Object.defineProperty(Storage.prototype,"setItem",{...originalDescriptor,value:function(key,value){prototypeSaved=value;}});',
  '    prototypePatchSupported=Storage.prototype.setItem!==nativeSetItem;',
  '    localStorage.setItem("prototype-shadow",sourceProbe);',
  '    prototypeReference=prototypeSaved===sourceProbe;',
  '    prototypeStored=localStorage.getItem("prototype-shadow");',
  '    Reflect.apply(nativeSetItem,localStorage,["captured-native",sourceProbe]);',
  '    capturedSource=localStorage.getItem("captured-native");',
  '  } catch(error) { prototypeError=String(error); }',
  '  finally { Object.defineProperty(Storage.prototype,"setItem",originalDescriptor); }',
  '  let userlandSaved;',
  '  const userland={setItem(key,value){userlandSaved=value;}};',
  '  userland.setItem("reference",sourceProbe);',
  '  const report={',
  '    expectedSource,directSource,ownOverrideSupported,ownReference,ownStored,ownError,',
  '    prototypePatchSupported,prototypeReference,prototypeStored,prototypeError,capturedSource,',
  '    userlandReference:userlandSaved===sourceProbe',
  '  };',
  '  document.getElementById("out").textContent="PASS "+JSON.stringify(report);',
  '} catch(error) {',
  '  document.getElementById("out").textContent="FAIL "+String(error.stack||error);',
  '}',
  '</script></body></html>'
].join('\n');

async function main() {
  const server=http.createServer((request,response)=>{
    if(new URL(request.url??'/', 'http://localhost').pathname!=='/') {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    response.end(html);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen({port:0,host:'127.0.0.1'},()=>resolve(undefined));
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected local TCP server');
    const browser=process.env.CHROMIUM_BIN??'chromium';
    const {stdout,stderr}=await promisify(execFile)(browser,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=4000','--dump-dom',
      'http://127.0.0.1:'+address.port+'/'
    ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
    assert.match(stdout,/<pre id="out">PASS /u,
      'Chromium did not complete Storage dispatch probe: '+String(stderr)+'\n'+stdout.slice(0,2000));
    const match=stdout.match(/<pre id="out">PASS ([\s\S]*?)<\/pre>/u);
    assert.ok(match,'Expected Storage dispatch report');
    const report=JSON.parse(match[1]);
    assert.equal(report.directSource,report.expectedSource,'native inherited method stringifies function');
    assert.equal(report.capturedSource,report.expectedSource,'captured native method bypasses a later prototype patch');
    assert.equal(report.userlandReference,true,'same-named userland method stores a function reference');
    if(report.ownOverrideSupported) {
      assert.equal(report.ownReference,true,'own Storage method override stores a function reference');
      assert.equal(report.ownStored,null,'own override must not call native Storage conversion');
    }
    if(report.prototypePatchSupported) {
      assert.equal(report.prototypeReference,true,'prototype-patched method stores a function reference');
      assert.equal(report.prototypeStored,null,'prototype override must not call native Storage conversion');
    }
    process.stdout.write(JSON.stringify({browser,report},null,2)+'\n');
  } finally {
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module) {
  main().catch(error=>{
    console.error(error);
    process.exitCode=1;
  });
}

module.exports={main};
