'use strict';

const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');
const {parse,observesFunctionSource}=require('../src/ast');

const exec=promisify(execFile);
const source=[
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'localStorage.clear();',
  'localStorage.setItem("sco-host-lock-source",inspect);',
  'globalThis.result={value:inspect(),independent:independent(),',
  '  stored:localStorage.getItem("sco-host-lock-source"),host:location.hostname};'
].join('\n');

/**
 * @param {string} value
 * @returns {{length:number,sha256:string,containsPrivateName:boolean}}
 */
function fingerprint(value){
  return {
    length:value.length,
    sha256:crypto.createHash('sha256').update(value,'utf8').digest('hex'),
    containsPrivateName:value.includes('privateLocal')
  };
}

/**
 * @param {string} code
 * @returns {string}
 */
function page(code){
  return [
    '<!doctype html><html><body><pre id="result">PENDING</pre>',
    '<script>',
    'window.addEventListener("error",function(event){',
    '  const node=document.getElementById("result");',
    '  node.textContent="ERROR:"+btoa(String(event.message||event.error||"unknown"));',
    '});',
    '</script>',
    '<script>',
    code,
    'document.getElementById("result").textContent="PASS:"+btoa(JSON.stringify(globalThis.result));',
    '</script></body></html>'
  ].join('\n');
}

/**
 * @param {string} url
 * @returns {Promise<{kind:'PASS',result:{value:number,independent:number,stored:string,host:string}}|{kind:'ERROR',message:string}>}
 */
async function executeChromium(url){
  const {stdout,stderr}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=2500','--dump-dom',url
  ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
  const pass=stdout.match(/<pre id="result">PASS:([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  if(pass){
    return {kind:'PASS',result:/** @type {{value:number,independent:number,stored:string,host:string}} */(
      JSON.parse(Buffer.from(pass,'base64').toString('utf8'))
    )};
  }
  const error=stdout.match(/<pre id="result">ERROR:([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  if(error){
    return {kind:'ERROR',message:Buffer.from(error,'base64').toString('utf8')};
  }
  throw new Error('Chromium did not publish a result: '+String(stderr)+' '+stdout.slice(0,1200));
}

async function main(){
  const ast=parse(source,'script');
  const sourceObserver=observesFunctionSource(ast);
  assert.equal(sourceObserver,false,
    'current source observer should miss inherited native Storage.setItem DOMString conversion');

  const output=obfuscateFiles([{
    path:'entry.js',sourceType:'script',code:source
  }],{
    mode:'sco',
    seed:'sco-host-lock-storage-source-browser',
    strings:false,
    properties:false,
    identifiers:true,
    allowedHosts:['127.0.0.1']
  });
  const file=output.files[0];
  assert.ok(file,'expected a generated host-locked SCO file');
  const generated=String(file.code);
  assert.ok(file.metrics.bindings>=2,'expected private reader and unrelated helper rewrites');
  assert.ok(!generated.includes('privateLocal'),'expected the source-observed reader body to be rewritten');
  assert.ok(!generated.includes('independentLocal'),'expected unrelated private helper rewrite to remain');
  assert.ok(generated.includes('127.0.0.1'),'expected the explicit host lock to be emitted');
  assert.ok(generated.includes('Unauthorized execution host'),'expected an executable denied-host guard');

  const pages=new Map([
    ['/native',page(source)],
    ['/generated',page(generated)],
    ['/denied',page(generated)]
  ]);
  const server=http.createServer((request,response)=>{
    const pathname=(request.url??'/').split('?')[0];
    const body=pages.get(pathname);
    if(body===undefined){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'0.0.0.0',resolve);
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing browser fixture port');
    const port=address.port;
    const native=await executeChromium('http://127.0.0.1:'+port+'/native');
    const emitted=await executeChromium('http://127.0.0.1:'+port+'/generated');
    const denied=await executeChromium('http://127.0.0.2:'+port+'/denied');

    assert.equal(native.kind,'PASS','native source fixture must execute');
    assert.equal(emitted.kind,'PASS','allowed SCO host-lock fixture must execute');
    assert.equal(denied.kind,'ERROR','the same generated artifact must reject a different hostname');
    assert.match(denied.message,/Unauthorized execution host/u);

    if(native.kind!=='PASS'||emitted.kind!=='PASS')throw new Error('Expected native and allowed generated browser results');
    assert.equal(native.result.host,'127.0.0.1');
    assert.equal(emitted.result.host,'127.0.0.1');
    assert.equal(native.result.value,29);
    assert.equal(emitted.result.value,29);
    assert.equal(native.result.independent,7);
    assert.equal(emitted.result.independent,7);
    assert.ok(native.result.stored.includes('privateLocal'));
    assert.ok(!emitted.result.stored.includes('privateLocal'));
    assert.notEqual(native.result.stored,emitted.result.stored,
      'native Storage DOMString conversion exposes the changed emitted function source');

    process.stdout.write('SCO_HOST_LOCK_STORAGE_SOURCE_BROWSER '+JSON.stringify({
      browser:'Chromium',
      sourceObserver,
      hostLock:'allowed 127.0.0.1 / denied 127.0.0.2',
      metrics:file.metrics,
      nativeSource:fingerprint(native.result.stored),
      emittedSource:fingerprint(emitted.result.stored),
      runtimeValuesPreserved:true,
      sourceParity:false,
      hostLockPositive:true,
      hostLockNegative:true
    })+'\n');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={main};
