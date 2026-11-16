'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @typedef {{observed:string[],successful:number}} Outcome */

/**
 * Evaluate one native or emitted JavaScript source in a fresh Chromium page.
 * The CSP permits a same-origin script without inline code or eval.
 * @param {string} url
 * @returns {Promise<Outcome>}
 */
async function runChromium(url){
  const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=4000','--dump-dom',url
  ],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024,windowsHide:true});
  const match=stdout.match(/<pre id="out">([^<]+)<\/pre>/u);
  assert.ok(match,'Chromium did not complete fixture: '+stdout.slice(-1500));
  return /** @type {Outcome} */(JSON.parse(match[1]));
}

/** @returns {Promise<void>} */
async function main(){
  const source=[
    'const state={};const safe={publicField:9};const observed=[];',
    'try{state["privateField"]()}catch(error){observed.push(error.message)}',
    'try{new state["privateField"]()}catch(error){observed.push(error.message)}',
    'try{[...state["privateField"]]}catch(error){observed.push(error.message)}',
    'const successful=safe["publicField"];',
    'document.getElementById("out").textContent=JSON.stringify({observed,successful});'
  ].join('\n');
  /** @type {Map<string,string>} */
  const scripts=new Map([['native',source]]);
  for(const mode of /** @type {const} */ (['coo','sco'])){
    const output=obfuscateFiles([{path:'entry.js',sourceType:'script',code:source}],{
      mode,seed:'chromium-string-typeerror/'+mode,
      strings:true,identifiers:false,properties:false
    }).files[0];
    assert.equal(output.metrics.literals,1,
      'One successful computed key must still be transformed in '+mode);
    scripts.set(mode,/** @type {string} */(output.code));
  }
  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    const uri=new URL(request.url??'/','http://localhost');
    const match=/^\/(native|coo|sco)\/(index\.html|entry\.js)$/u.exec(uri.pathname);
    if(!match){response.writeHead(404).end();return;}
    const kind=match[1];
    if(match[2]==='index.html'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8',
        'content-security-policy':"default-src 'none'; script-src 'self'",
        'cache-control':'no-store'});
      response.end('<!doctype html><meta charset="utf-8"><pre id="out">pending</pre>'+
        '<script src="/'+kind+'/entry.js"></script>');
      return;
    }
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8',
      'cache-control':'no-store'});
    response.end(scripts.get(kind));
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected TCP listener');
    const origin='http://127.0.0.1:'+address.port;
    const native=await runChromium(origin+'/native/index.html');
    assert.equal(native.observed.length,3);
    assert.equal(native.successful,9);
    assert.ok(native.observed.every(message=>message.includes('state.privateField')),
      'All native Chromium errors must actually expose the source-spelled key');
    for(const mode of ['coo','sco']){
      const emitted=await runChromium(origin+'/'+mode+'/index.html');
      assert.deepEqual(emitted,native,mode+' must preserve Chromium error and success semantics');
    }
    console.log(JSON.stringify({
      runtime:'Chromium',csp:"default-src 'none'; script-src 'self'",
      compared:['native','coo','sco'],failureExpressions:native.observed.length,
      successfulEncodedField:true,native,matched:true
    }));
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
