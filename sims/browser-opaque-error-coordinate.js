'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

const exec=promisify(execFile);
const original='globalThis.__opaqueOutput=globalThis.__opaqueInput.value;';

/**
 * @param {number} port
 * @param {string} scriptPath
 * @param {boolean} fail
 * @returns {Promise<string>}
 */
async function executeChromium(port,scriptPath,fail){
  const url='http://127.0.0.1:'+port+'/page?script='+
    encodeURIComponent(scriptPath)+'&fail='+(fail?'1':'0');
  const {stdout}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=5000','--dump-dom',url
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium did not expose the opaque-host result: '+stdout.slice(0,1200));
  return Buffer.from(encoded,'base64').toString('utf8');
}

/** @returns {Promise<void>} */
async function run(){
  const transformed=/** @type {string} */(obfuscateFiles([{
    path:'entry.js',sourceType:'script',code:original
  }],{
    mode:'coo',seed:'browser-opaque-error-coordinate',
    strings:false,properties:false,identifiers:false,
    allowedHosts:['127.0.0.1']
  }).files[0].code);

  assert.notEqual(transformed,original);
  assert.match(transformed,/Unauthorized execution host/u);

  /** @type {Map<string,string>} */
  const scripts=new Map([
    ['/native.js',original],
    ['/generated.js',transformed]
  ]);

  const server=http.createServer((req,res)=>{
    const parsed=new URL(req.url??'/', 'http://127.0.0.1');
    if(parsed.pathname==='/page'){
      const script=parsed.searchParams.get('script');
      const fail=parsed.searchParams.get('fail')==='1';
      if(script!=='/native.js'&&script!=='/generated.js'){
        res.writeHead(400).end();
        return;
      }
      const input=fail?'null':'{value:73}';
      const html='<!doctype html><html><body><script>'+
        'globalThis.__opaqueInput='+input+';globalThis.__opaqueOutput=null;'+
        'globalThis.__opaqueError="";'+
        'globalThis.onerror=(message,source,line,column)=>{'+
        'globalThis.__opaqueError=line+":"+column;return true;};'+
        '<\/script><script src="'+script+'"><\/script><script>'+
        'setTimeout(()=>{const value='+(
          fail ? 'globalThis.__opaqueError' : '"ok:"+globalThis.__opaqueOutput'
        )+';const pre=document.createElement("pre");pre.id="result";'+
        'pre.textContent=btoa(String(value));document.body.append(pre);},0);'+
        '<\/script></body></html>';
      res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      res.end(html);
      return;
    }
    const code=scripts.get(parsed.pathname);
    if(code!==undefined){
      res.writeHead(200,{'content-type':'application/javascript; charset=utf-8'});
      res.end(code);
      return;
    }
    res.writeHead(404).end();
  });

  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing Chromium fixture port');

    const nativeSafe=await executeChromium(address.port,'/native.js',false);
    const generatedSafe=await executeChromium(address.port,'/generated.js',false);
    assert.equal(nativeSafe,'ok:73');
    assert.equal(generatedSafe,nativeSafe);

    const nativeFailure=await executeChromium(address.port,'/native.js',true);
    const generatedFailure=await executeChromium(address.port,'/generated.js',true);
    assert.match(nativeFailure,/^\d+:\d+$/u);
    assert.match(generatedFailure,/^\d+:\d+$/u);
    assert.notEqual(generatedFailure,nativeFailure,
      'An opaque host error observer should expose the host-lock coordinate shift');

    process.stdout.write('OPAQUE_BROWSER_ERROR_COORDINATE '+JSON.stringify({
      nativeSafe,generatedSafe,nativeFailure,generatedFailure,
      parity:nativeFailure===generatedFailure
    })+'\n');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={run,original};
