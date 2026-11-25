'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

const runBrowser=promisify(execFile);
const source=[
  'function hidden(){const local=helper();return local;}',
  'function helper(){return 19;}',
  'class Local{callback=hidden;}',
  'function publicFactory(){return new Local();}'
].join('');
const modes=/** @type {const} */ (['coo','sco']);

/**
 * @param {string} scriptPath
 * @returns {string}
 */
function pageFor(scriptPath) {
  return '<!doctype html><meta charset="utf-8">'+
    '<pre id="result"></pre><pre id="failure"></pre>'+
    '<script src="'+scriptPath+'"></script>'+
    '<script>try{'+
      'var callback=publicFactory().callback;'+
      'var result={value:callback(),source:Function.prototype.toString.call(callback),error:null};'+
      'document.getElementById("result").textContent=btoa(JSON.stringify(result));'+
    '}catch(error){document.getElementById("failure").textContent=String(error&&error.stack||error);}</script>';
}

/**
 * @param {string} origin
 * @param {string} pagePath
 * @returns {Promise<{value:number,source:string,error:string|null}>}
 */
async function observe(origin,pagePath) {
  const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=1500','--dump-dom',
    origin+pagePath
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  const failure=stdout.match(/<pre id="failure">([^<]*)<\/pre>/u)?.[1]??null;
  assert.ok(encoded,'Chromium did not capture exported-factory callback: '+(failure??stdout.slice(0,1200)));
  return /** @type {{value:number,source:string,error:string|null}} */ (
    JSON.parse(Buffer.from(encoded,'base64').toString('utf8'))
  );
}

/** @returns {Promise<void>} */
async function main() {
  /** @type {Map<string,{body:string,type:string}>} */
  const resources=new Map();
  for(const mode of modes) {
    const output=obfuscateFiles([{
      path:'entry.js',sourceType:'script',code:source
    }],{
      mode,seed:'agent9-exported-factory-browser/'+mode,
      strings:false,properties:true,identifiers:true
    });
    assert.equal(output.files.length,1);
    const emittedValue=output.files[0].code;
    assert.equal(typeof emittedValue,'string');
    const emitted=/** @type {string} */ (emittedValue);
    assert.ok(output.files[0].metrics.bindings>0,
      mode+' must transform a private lexical binding inside the returned callback');
    const base='/'+mode;
    resources.set(base+'/native.js',{body:source,type:'text/javascript; charset=utf-8'});
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

  try {
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    for(const mode of modes) {
      const base='/'+mode;
      const native=await observe(origin,base+'/native.html');
      const emitted=await observe(origin,base+'/compiled.html');
      assert.equal(native.value,19,mode+' native value');
      assert.equal(emitted.value,native.value,mode+' native/emitted runtime parity');
      assert.equal(native.error,null,mode+' native browser error');
      assert.equal(emitted.error,null,mode+' emitted browser error');
      assert.ok(native.source.includes('local'),mode+' native callback source must contain original local name');
      assert.notEqual(emitted.source,native.source,mode+' host must observe transformed callback source');
      assert.ok(!emitted.source.includes('local'),mode+' runtime extraction must not recover original local name');
      process.stdout.write('CHROMIUM_EXPORTED_FACTORY_SOURCE '+JSON.stringify({
        mode,value:emitted.value,sourceChanged:native.source!==emitted.source,
        nativeSource:native.source,emittedSource:emitted.source
      })+'\n');
    }
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main};
