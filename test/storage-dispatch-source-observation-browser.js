'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const source=[
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'function nativeCase(key){',
  '  if(Object.prototype.hasOwnProperty.call(localStorage,"setItem"))throw Error("unexpected own setItem before native case");',
  '  if(localStorage.setItem!==Storage.prototype.setItem)throw Error("native inherited dispatch not active");',
  '  localStorage.setItem(key,inspect);',
  '  const observed=localStorage.getItem(key);',
  '  localStorage.removeItem(key);',
  '  return {source:observed,value:inspect(),independent:independent()};',
  '}',
  'function ownOverrideCase(key){',
  '  const captured=new WeakMap();',
  '  const previous=Object.getOwnPropertyDescriptor(localStorage,"setItem");',
  '  Object.defineProperty(localStorage,"setItem",{configurable:true,writable:true,value:function(_key,value){captured.set(this,value);}});',
  '  try {',
  '    if(!Object.prototype.hasOwnProperty.call(localStorage,"setItem"))throw Error("own override was not installed");',
  '    localStorage.setItem(key,inspect);',
  '    const stored=captured.get(localStorage);',
  '    return {sameReference:stored===inspect,value:stored(),independent:independent(),nativeStorageValue:localStorage.getItem(key)};',
  '  } finally {',
  '    if(previous)Object.defineProperty(localStorage,"setItem",previous);',
  '    else delete localStorage.setItem;',
  '  }',
  '}',
  'function prototypeOverrideCase(key){',
  '  const captured=new WeakMap();',
  '  const previous=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
  '  if(!previous||typeof previous.value!=="function")throw Error("native prototype descriptor unavailable");',
  '  Object.defineProperty(Storage.prototype,"setItem",{configurable:true,writable:true,value:function(_key,value){captured.set(this,value);}});',
  '  try {',
  '    if(Object.prototype.hasOwnProperty.call(localStorage,"setItem"))throw Error("unexpected own override in prototype case");',
  '    if(localStorage.setItem!==Storage.prototype.setItem)throw Error("prototype override was not dispatched");',
  '    localStorage.setItem(key,inspect);',
  '    const stored=captured.get(localStorage);',
  '    return {sameReference:stored===inspect,value:stored(),independent:independent(),nativeStorageValue:localStorage.getItem(key)};',
  '  } finally {',
  '    Object.defineProperty(Storage.prototype,"setItem",previous);',
  '  }',
  '}',
  'function capturedNativeAliasCase(key){',
  '  const previous=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
  '  if(!previous||typeof previous.value!=="function")throw Error("native prototype descriptor unavailable");',
  '  const nativeSetItem=previous.value;',
  '  Object.defineProperty(Storage.prototype,"setItem",{configurable:true,writable:true,value:function(_key,_value){}});',
  '  try {',
  '    if(Object.prototype.hasOwnProperty.call(localStorage,"setItem"))throw Error("unexpected own override in captured-native case");',
  '    nativeSetItem.call(localStorage,key,inspect);',
  '    const observed=localStorage.getItem(key);',
  '    localStorage.removeItem(key);',
  '    return {source:observed,value:inspect(),independent:independent()};',
  '  } finally {',
  '    Object.defineProperty(Storage.prototype,"setItem",previous);',
  '  }',
  '}',
  'export function sample(prefix){',
  '  return {',
  '    native:nativeCase(prefix+"-native"),',
  '    own:ownOverrideCase(prefix+"-own"),',
  '    prototype:prototypeOverrideCase(prefix+"-prototype"),',
  '    capturedNative:capturedNativeAliasCase(prefix+"-captured-native")',
  '  };',
  '}'
].join('\n');

async function main() {
  const result=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',
    seed:'storage-dispatch-native-own-prototype',
    properties:false,
    identifiers:true,
    strings:false
  });
  const file=result.files[0];
  if(!file)throw Error('Expected emitted module');
  const emitted=String(file.code);
  assert.ok(file.metrics.bindings>=2,'expected private binding rewrites');
  assert.ok(!emitted.includes('privateLocal'),'observed function body should be rewritten on current main');
  assert.ok(!emitted.includes('independentLocal'),'independent positive should retain rewrite yield');

  const html=[
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<pre id="result">pending</pre><script type="module">',
    'try {',
    '  const nativeModule=await import("/native.mjs");',
    '  const compiledModule=await import("/compiled.mjs");',
    '  const native=nativeModule.sample("native");',
    '  const compiled=compiledModule.sample("compiled");',
    '  const summary={',
    '    nativeInheritedSource:native.native.source,',
    '    compiledInheritedSource:compiled.native.source,',
    '    nativeAliasSource:native.capturedNative.source,',
    '    compiledAliasSource:compiled.capturedNative.source,',
    '    ownOverrideSameReference:native.own.sameReference&&compiled.own.sameReference,',
    '    ownOverrideValuesMatch:native.own.value===compiled.own.value&&native.own.value===29,',
    '    ownOverrideNoNativeWrite:native.own.nativeStorageValue===null&&compiled.own.nativeStorageValue===null,',
    '    prototypeOverrideSameReference:native.prototype.sameReference&&compiled.prototype.sameReference,',
    '    prototypeOverrideValuesMatch:native.prototype.value===compiled.prototype.value&&native.prototype.value===29,',
    '    prototypeOverrideNoNativeWrite:native.prototype.nativeStorageValue===null&&compiled.prototype.nativeStorageValue===null,',
    '    independentValuesPreserved:native.native.independent===7&&compiled.native.independent===7&&',
    '      native.own.independent===7&&compiled.own.independent===7&&',
    '      native.prototype.independent===7&&compiled.prototype.independent===7&&',
    '      native.capturedNative.independent===7&&compiled.capturedNative.independent===7,',
    '    nativeValuesPreserved:native.native.value===29&&compiled.native.value===29&&',
    '      native.capturedNative.value===29&&compiled.capturedNative.value===29',
    '  };',
    '  summary.inheritedNativeMismatch=summary.nativeInheritedSource!==summary.compiledInheritedSource;',
    '  summary.capturedNativeAliasMismatch=summary.nativeAliasSource!==summary.compiledAliasSource;',
    '  if(!summary.nativeInheritedSource.includes("privateLocal")||summary.compiledInheritedSource.includes("privateLocal"))',
    '    throw Error("inherited native Storage.setItem did not expose transformed source "+JSON.stringify(summary));',
    '  if(!summary.nativeAliasSource.includes("privateLocal")||summary.compiledAliasSource.includes("privateLocal"))',
    '    throw Error("captured native Storage.setItem alias did not expose transformed source "+JSON.stringify(summary));',
    '  if(!summary.inheritedNativeMismatch||!summary.capturedNativeAliasMismatch||',
    '     !summary.ownOverrideSameReference||!summary.ownOverrideValuesMatch||!summary.ownOverrideNoNativeWrite||',
    '     !summary.prototypeOverrideSameReference||!summary.prototypeOverrideValuesMatch||!summary.prototypeOverrideNoNativeWrite||',
    '     !summary.independentValuesPreserved||!summary.nativeValuesPreserved)',
    '    throw Error("dispatch identity controls failed "+JSON.stringify(summary));',
    '  document.getElementById("result").textContent="PASS "+JSON.stringify(summary);',
    '} catch(error) {',
    '  document.getElementById("result").textContent="FAIL "+String(error.stack||error);',
    '}',
    '</script></body></html>'
  ].join('\n');

  const bodies=new Map([
    ['/',html],
    ['/native.mjs',source],
    ['/compiled.mjs',emitted]
  ]);
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
      '--virtual-time-budget=4000','--dump-dom',
      'http://127.0.0.1:'+address.port+'/'];
    const {stdout,stderr}=await promisify(execFile)(chrome,args,{
      timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'
    });
    assert.match(stdout,/<pre id="result">PASS /,String(stderr));
    const match=stdout.match(/<pre id="result">PASS ([\s\S]*?)<\/pre>/);
    assert.ok(match,'Expected rendered dispatch-control result');
    const summary=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
    console.log(JSON.stringify({
      browser:'Chromium',
      metrics:file.metrics,
      inheritedNativeMismatch:summary.inheritedNativeMismatch,
      capturedNativeAliasMismatch:summary.capturedNativeAliasMismatch,
      ownOverrideSameReference:summary.ownOverrideSameReference,
      prototypeOverrideSameReference:summary.prototypeOverrideSameReference,
      independentValuesPreserved:summary.independentValuesPreserved,
      nativeValuesPreserved:summary.nativeValuesPreserved
    }));
  } finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
