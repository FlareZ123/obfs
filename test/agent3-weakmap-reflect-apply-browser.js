'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const run=promisify(execFile);

const mutationSource=[
  'const C=Reflect.apply(Function.prototype.bind,WeakMap,[null]);',
  'const carrier={instance:new C()};',
  'const weakMapPrototype=Object.getPrototypeOf(carrier.instance);',
  'const nativeWeakMapSet=weakMapPrototype.set;',
  'weakMapPrototype.set=function(key,value){',
  '  document.title=value;',
  '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
  '};'
].join('\\n');

const storageSource=[
  'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
  'if(!descriptor||typeof descriptor.value!=="function")throw new Error("Storage.setItem descriptor unavailable");',
  'const captured=new WeakMap();',
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  Object.defineProperty(Storage.prototype,"setItem",{',
  '    ...descriptor,',
  '    value:function(_key,value){',
  '      captured.set(this,value);',
  '      return Reflect.apply(descriptor.value,this,[_key,"constant"]);',
  '    }',
  '  });',
  '  localStorage.setItem("agent3-reflect-apply-weakmap-crossfile",inspect);',
  '  return {value:inspect(),independent:independent()};',
  '}'
].join('\n');

const entrySource=[
  "import './mutate.mjs';",
  "import {sample} from './storage.mjs';",
  'export {sample};'
].join('\n');

const pageSource='<!doctype html><html><head><meta charset="utf-8"></head><body>'+
  '<script type="module">try{const {sample}=await import("./entry.mjs");'+
  'const result=sample();const payload={result,capturedSource:document.title};'+
  'const pre=document.createElement("pre");pre.id="result";pre.textContent=btoa(JSON.stringify(payload));'+
  'document.body.appendChild(pre);}catch(error){const pre=document.createElement("pre");'+
  'pre.id="failure";pre.textContent=String(error.stack||error);document.body.appendChild(pre);}</script>'+
  '</body></html>';

/**
 * @param {string} prefix
 * @param {Array<{path:string,code:string}>} files
 * @returns {Map<string,string>}
 */
function makeResources(prefix,files) {
  const resources=new Map([['/'+prefix+'/index.html',pageSource]]);
  for(const file of files)resources.set('/'+prefix+'/'+file.path,file.code);
  return resources;
}

/**
 * @param {string} executable
 * @param {string} origin
 * @param {string} target
 * @returns {Promise<{result:{value:number,independent:number},capturedSource:string}>}
 */
async function runTarget(executable,origin,target) {
  const {stdout}=await run(executable,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=10000','--dump-dom',
    origin+'/'+target+'/index.html'
  ],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,target+' Chromium failed: '+stdout.slice(0,2000));
  return /** @type {{result:{value:number,independent:number},capturedSource:string}} */(
    JSON.parse(Buffer.from(encoded,'base64').toString('utf8'))
  );
}

async function main() {
  const executable=process.env.CHROMIUM_BIN??'google-chrome';
  const version=await run(executable,['--version'],{encoding:'utf8',timeout:15000});
  assert.match(version.stdout,/(Chrome|Chromium)\s+\d+\./u);
  const nativeFiles=[
    {path:'entry.mjs',code:entrySource},
    {path:'mutate.mjs',code:mutationSource},
    {path:'storage.mjs',code:storageSource}
  ];
  const compiled=obfuscateFiles(nativeFiles.map(file=>({
    path:file.path,sourceType:'module',code:file.code
  })),{
    mode:'coo',seed:'agent3-reflect-apply-weakmap-crossfile-chromium',
    properties:false,identifiers:true,strings:false,closedWorld:true
  });
  const emittedFiles=compiled.files.map(file=>({
    path:file.path,code:String(file.code)
  }));
  const storage=compiled.files.find(file=>file.path==='storage.mjs');
  assert.ok(storage);
  // Defer the binding assertion until after Chromium captures the emitted source.

  const resources=new Map([
    ...makeResources('native',nativeFiles),
    ...makeResources('emitted',emittedFiles)
  ]);
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
    const body=resources.get(pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':pathname.endsWith('.html')?
        'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing Chromium test port');
    const origin='http://127.0.0.1:'+address.port;
    const native=await runTarget(executable,origin,'native');
    const emitted=await runTarget(executable,origin,'emitted');
    process.stdout.write('CHROMIUM_BOUND_WEAKMAP_DIAGNOSTIC '+JSON.stringify({storageMetrics:storage.metrics,native,emitted})+'\n');
    assert.equal(storage.metrics.bindings,0,JSON.stringify({storageMetrics:storage.metrics,native,emitted}));
    assert.deepEqual(emitted.result,native.result);
    assert.ok(native.capturedSource.includes('privateLocal'),JSON.stringify(native));
    assert.equal(emitted.capturedSource,native.capturedSource,
      JSON.stringify({native,emitted,storageMetrics:storage.metrics}));
    process.stdout.write('CHROMIUM_BOUND_WEAKMAP_CROSSFILE_PARITY '+JSON.stringify({
      browser:version.stdout.trim(),storageMetrics:storage.metrics,native,emitted
    })+'\n');
  } finally {
    await new Promise((resolve,reject)=>{
      server.close(error=>error?reject(error):resolve(undefined));
    });
  }
}

main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
