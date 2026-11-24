'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);

/** @typedef {{kind:string,source:string,original:string,expected:number|string,identifiers:boolean,strings:boolean,metric:'bindings'|'literals'}} Case */

/** @type {Case[]} */
const cases=[
  {
    kind:'identifier',
    source:[
      'function publicReader(){',
      'function hidden(inputValue){return inputValue+1;}',
      'queueMicrotask(hidden);',
      'return hidden(2);',
      '}',
      'module.exports=publicReader;'
    ].join(''),
    original:'inputValue',expected:3,identifiers:true,strings:false,metric:'bindings'
  },
  {
    kind:'string',
    source:[
      'function publicReader(){',
      "function hidden(){return 'callbackSourceLiteral';}",
      'queueMicrotask(hidden);',
      'return hidden();',
      '}',
      'module.exports=publicReader;'
    ].join(''),
    original:'callbackSourceLiteral',expected:'callbackSourceLiteral',
    identifiers:false,strings:true,metric:'literals'
  }
];

/**
 * @param {string} scriptPath
 * @returns {string}
 */
function pageFor(scriptPath){
  return '<!doctype html><meta charset="utf-8">'+
    '<pre id="result"></pre><pre id="failure"></pre>'+
    '<script>'+
      'window.__observation={source:null};'+
      'window.queueMicrotask=function(callback){'+
        'window.__observation.source=Function.prototype.toString.call(callback);'+
      '};'+
      'window.module={exports:{}};'+
    '</script>'+
    '<script src="'+scriptPath+'"></script>'+
    '<script>try{'+
      'var value=window.module.exports();'+
      'var result={value:value,source:window.__observation.source,error:null};'+
      'document.getElementById("result").textContent=btoa(JSON.stringify(result));'+
    '}catch(error){document.getElementById("failure").textContent=String(error&&error.stack||error);}</script>';
}

/**
 * @param {string} origin
 * @param {string} pagePath
 * @returns {Promise<{value:number|string,source:string|null,error:string|null}>}
 */
async function observe(origin,pagePath){
  const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=1500','--dump-dom',
    origin+pagePath
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium did not produce host-held source observation: '+stdout.slice(0,1600));
  return /** @type {{value:number|string,source:string|null,error:string|null}} */(
    JSON.parse(Buffer.from(encoded,'base64').toString('utf8'))
  );
}

/** @returns {Promise<void>} */
async function main(){
  /** @type {Map<string,{body:string,type:string}>} */
  const resources=new Map();
  for(const scenario of cases){
    const output=obfuscateFiles([{
      path:'entry.js',sourceType:'commonjs',code:scenario.source
    }],{
      mode:'coo',seed:'agent1-host-held-callback-browser/'+scenario.kind,
      identifiers:scenario.identifiers,strings:scenario.strings,properties:false
    });
    assert.equal(output.files.length,1);
    const emittedValue=output.files[0].code;
    assert.equal(typeof emittedValue,'string');
    const emitted=/** @type {string} */(emittedValue);
    const metric=output.files[0].metrics[scenario.metric];
    assert.ok(metric>0,scenario.kind+' transform must have positive yield');
    const base='/'+scenario.kind;
    resources.set(base+'/native.js',{body:scenario.source,type:'text/javascript; charset=utf-8'});
    resources.set(base+'/compiled.js',{body:emitted,type:'text/javascript; charset=utf-8'});
    resources.set(base+'/native.html',{body:pageFor(base+'/native.js'),type:'text/html; charset=utf-8'});
    resources.set(base+'/compiled.html',{body:pageFor(base+'/compiled.js'),type:'text/html; charset=utf-8'});
  }

  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
    const resource=resources.get(pathname);
    if(!resource){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':resource.type,'cache-control':'no-store'});
    response.end(resource.body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });

  try{
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    for(const scenario of cases){
      const base='/'+scenario.kind;
      const native=await observe(origin,base+'/native.html');
      const emitted=await observe(origin,base+'/compiled.html');
      assert.equal(native.value,scenario.expected,scenario.kind+' native return value');
      assert.equal(emitted.value,native.value,scenario.kind+' native/emitted return parity');
      assert.equal(native.error,null,scenario.kind+' native page error');
      assert.equal(emitted.error,null,scenario.kind+' emitted page error');
      assert.ok(native.source&&native.source.includes(scenario.original),
        scenario.kind+' host-held callback source must contain the original spelling');
      assert.ok(emitted.source,scenario.kind+' host-held callback source must be captured');
      assert.notEqual(emitted.source,native.source,
        scenario.kind+' compiler output must demonstrate the source-observation mismatch');
      assert.ok(!emitted.source.includes(scenario.original),
        scenario.kind+' emitted callback source must not retain the original spelling');
      process.stdout.write('CHROMIUM_HOST_HELD_CALLBACK '+JSON.stringify({
        kind:scenario.kind,metric:scenario.metric,
        nativeValue:native.value,emittedValue:emitted.value,
        nativeSource:native.source,emittedSource:emitted.source,
        sourceChanged:native.source!==emitted.source
      })+'\n');
    }
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main};
