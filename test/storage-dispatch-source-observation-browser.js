'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @type {Record<string,string>} */
const fixtures={
  native:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'function independent(){const independentLocal=7;return independentLocal;}',
    'export function sample(){',
    '  localStorage.setItem("storage-dispatch-native",inspect);',
    '  return {value:inspect(),independent:independent()};',
    '}'
  ].join('\n'),
  own:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'function independent(){const independentLocal=7;return independentLocal;}',
    'const captured=new WeakMap();',
    'export function sample(){',
    '  const previous=Object.getOwnPropertyDescriptor(localStorage,"setItem");',
    '  Object.defineProperty(localStorage,"setItem",{configurable:true,writable:true,value:function(_key,value){captured.set(this,value);}});',
    '  try {',
    '    localStorage.setItem("storage-dispatch-own",inspect);',
    '    const stored=captured.get(localStorage);',
    '    return {sameReference:stored===inspect,value:stored(),independent:independent()};',
    '  } finally {',
    '    if(previous)Object.defineProperty(localStorage,"setItem",previous);',
    '    else delete localStorage.setItem;',
    '  }',
    '}'
  ].join('\n'),
  prototype:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'function independent(){const independentLocal=7;return independentLocal;}',
    'const captured=new WeakMap();',
    'export function sample(){',
    '  const previous=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
    '  if(!previous||typeof previous.value!=="function")throw Error("native prototype descriptor unavailable");',
    '  Object.defineProperty(Storage.prototype,"setItem",{configurable:true,writable:true,value:function(_key,value){captured.set(this,value);}});',
    '  try {',
    '    localStorage.setItem("storage-dispatch-prototype",inspect);',
    '    const stored=captured.get(localStorage);',
    '    return {sameReference:stored===inspect,value:stored(),independent:independent()};',
    '  } finally {',
    '    Object.defineProperty(Storage.prototype,"setItem",previous);',
    '  }',
    '}'
  ].join('\n'),
  capturedNative:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'function independent(){const independentLocal=7;return independentLocal;}',
    'export function sample(){',
    '  const previous=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
    '  if(!previous||typeof previous.value!=="function")throw Error("native prototype descriptor unavailable");',
    '  const nativeSetItem=previous.value;',
    '  Object.defineProperty(Storage.prototype,"setItem",{configurable:true,writable:true,value:function(_key,_value){}});',
    '  try {',
    '    nativeSetItem.call(localStorage,"storage-dispatch-captured-native",inspect);',
    '    return {value:inspect(),independent:independent()};',
    '  } finally {',
    '    Object.defineProperty(Storage.prototype,"setItem",previous);',
    '  }',
    '}'
  ].join('\n')
};
const caseNames=Object.keys(fixtures);
/** @type {Map<string,string>} */
const bodies=new Map();
/** @type {Record<string,any>} */
const metrics={};

for(const name of caseNames) {
  const source=fixtures[name];
  const result=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',
    seed:'storage-dispatch/'+name,
    properties:false,
    identifiers:true,
    strings:false
  });
  const file=result.files[0];
  if(!file)throw Error('Expected emitted '+name+' module');
  const emitted=String(file.code);
  assert.ok(file.metrics.bindings>=2,name+': expected private binding rewrites');
  assert.ok(!emitted.includes('privateLocal'),name+': observed function body should be rewritten');
  assert.ok(!emitted.includes('independentLocal'),name+': independent positive should retain rewrite yield');
  metrics[name]=file.metrics;
  bodies.set('/native-'+name+'.mjs',source);
  bodies.set('/compiled-'+name+'.mjs',emitted);
}

async function main() {
  const html=[
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<pre id="result">pending</pre><script type="module">',
    'try {',
    '  const names='+JSON.stringify(caseNames)+';',
    '  const report={};',
    '  for(const name of names){',
    '    const nativeModule=await import("/native-"+name+".mjs");',
    '    const compiledModule=await import("/compiled-"+name+".mjs");',
    '    const native=nativeModule.sample();',
    '    const nativeKey=name==="native"?"storage-dispatch-native":name==="capturedNative"?"storage-dispatch-captured-native":name==="own"?"storage-dispatch-own":"storage-dispatch-prototype";',
    '    const nativeSource=localStorage.getItem(nativeKey);',
    '    localStorage.removeItem(nativeKey);',
    '    const compiled=compiledModule.sample();',
    '    const compiledSource=localStorage.getItem(nativeKey);',
    '    localStorage.removeItem(nativeKey);',
    '    report[name]={native,compiled,nativeSource,compiledSource};',
    '  }',
    '  const nativeMismatch=report.native.nativeSource!==report.native.compiledSource;',
    '  const capturedNativeMismatch=report.capturedNative.nativeSource!==report.capturedNative.compiledSource;',
    '  const own=report.own,prototype=report.prototype;',
    '  const ownOverride=own.native.sameReference&&own.compiled.sameReference&&',
    '    own.native.value===29&&own.compiled.value===29&&',
    '    own.native.value===own.compiled.value&&',
    '    own.nativeSource===null&&own.compiledSource===null;',
    '  const prototypeOverride=prototype.native.sameReference&&prototype.compiled.sameReference&&',
    '    prototype.native.value===29&&prototype.compiled.value===29&&',
    '    prototype.native.value===prototype.compiled.value&&',
    '    prototype.nativeSource===null&&prototype.compiledSource===null;',
    '  const valuesPreserved=report.native.native.value===29&&report.native.compiled.value===29&&',
    '    report.capturedNative.native.value===29&&report.capturedNative.compiled.value===29&&',
    '    [report.native,report.own,report.prototype,report.capturedNative].every(pair=>',
    '      pair.native.independent===7&&pair.compiled.independent===7);',
    '  if(!report.native.nativeSource.includes("privateLocal")||report.native.compiledSource.includes("privateLocal"))',
    '    throw Error("native inherited dispatch did not expose transformed source "+JSON.stringify(report.native));',
    '  if(!report.capturedNative.nativeSource.includes("privateLocal")||report.capturedNative.compiledSource.includes("privateLocal"))',
    '    throw Error("captured native alias did not expose transformed source "+JSON.stringify(report.capturedNative));',
    '  if(!nativeMismatch||!capturedNativeMismatch||!ownOverride||!prototypeOverride||!valuesPreserved)',
    '    throw Error("Storage dispatch identity controls failed "+JSON.stringify({nativeMismatch,capturedNativeMismatch,ownOverride,prototypeOverride,valuesPreserved}));',
    '  document.getElementById("result").textContent="PASS "+JSON.stringify({nativeMismatch,capturedNativeMismatch,ownOverride,prototypeOverride,valuesPreserved});',
    '} catch(error) {',
    '  document.getElementById("result").textContent="FAIL "+String(error.stack||error);',
    '}',
    '</script></body></html>'
  ].join('\n');
  bodies.set('/',html);

  const server=http.createServer((request,response)=>{
    const body=bodies.get(request.url??'');
    if(body===undefined){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':request.url==='/'?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected local TCP server');
    const chrome=process.env.CHROMIUM_BIN??'chromium';
    const args=['--headless','--no-sandbox','--disable-gpu',
      '--disable-dev-shm-usage','--no-first-run',
      '--virtual-time-budget=6000','--dump-dom',
      'http://127.0.0.1:'+address.port+'/'];
    const {stdout,stderr}=await promisify(execFile)(chrome,args,{
      timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'
    });
    assert.match(stdout,/<pre id="result">PASS /,String(stderr));
    const match=stdout.match(/<pre id="result">PASS ([\s\S]*?)<\/pre>/);
    assert.ok(match,'Expected rendered dispatch-control result');
    const summary=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
    console.log(JSON.stringify({browser:'Chromium',metrics,
      nativeMismatch:summary.nativeMismatch,
      capturedNativeMismatch:summary.capturedNativeMismatch,
      ownOverride:summary.ownOverride,
      prototypeOverride:summary.prototypeOverride,
      valuesPreserved:summary.valuesPreserved}));
  } finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
