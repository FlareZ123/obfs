'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

const original='const owner={privateKey:17,otherKey:5};'+
  'const alias=(0,owner);'+
  'const output=alias.privateKey+alias.otherKey;'+
  'window.publicResult=output;';

/**
 * Host JS is never compiled or rewritten. It reads an external global with
 * its original public spelling and prints its value through the DOM.
 * The compiler must not replace this with a synthetic internal field.
 */
const host='document.getElementById("out").textContent='+
  'JSON.stringify(window.publicResult);';

/**
 * @param {Map<string,string>} scripts
 * @returns {Promise<{url:string,close:()=>Promise<void>}>}
 */
async function serverFor(scripts){
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/','http://localhost').pathname;
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    if(pathname==='/host.js'){
      response.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});
      response.end(host);
      return;
    }
    const parts=/^\/(native|coo|sco)\/(index\.html|entry\.js)$/u.exec(pathname);
    if(!parts){response.writeHead(404).end();return;}
    if(parts[2]==='index.html'){
      response.writeHead(200,{
        'content-type':'text/html; charset=utf-8',
        'content-security-policy':"default-src 'none'; script-src 'self'",
        'cache-control':'no-store'
      });
      response.end('<!doctype html><meta charset="utf-8">'+
        '<pre id="out">pending</pre>'+
        '<script src="/'+parts[1]+'/entry.js"></script>'+
        '<script src="/host.js"></script>');
      return;
    }
    response.writeHead(200,{
      'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'
    });
    response.end(scripts.get(parts[1])??'');
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const addr=server.address();
  if(!addr || typeof addr==='string')throw new Error('Expected TCP listener');
  return {
    url:'http://127.0.0.1:'+addr.port,
    close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))
  };
}

/** @param {string} url @returns {Promise<string>} */
async function browserText(url){
  const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=2000','--dump-dom',url
  ],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024,windowsHide:true});
  const match=stdout.match(/<pre id="out">([^<]*)<\/pre>/u);
  assert.ok(match,'Chromium failed to render host output '+stdout.slice(-1000));
  return match[1];
}

test('real CSP-restricted Chromium preserves private comma owner and public window API',
  {skip:process.platform!=='linux'&&!process.env.CHROMIUM_BIN},
  async()=>{
    const scripts=new Map([['native',original]]);
    for(const mode of /** @type {const} */(['coo','sco'])){
      const compiled=obfuscateFiles([{
        path:'entry.js',sourceType:'script',code:original
      }],{mode,seed:'browser-private-sequence/'+mode,
        properties:true,strings:false,identifiers:false});
      assert.equal(compiled.files[0].metrics.properties,2,
        mode+' must rename both wholly private record keys');
      assert.doesNotMatch(String(compiled.files[0].code),/privateKey|otherKey/u);
      assert.match(String(compiled.files[0].code),/publicResult/u,
        mode+' may not rewrite external window API name');
      scripts.set(mode,String(compiled.files[0].code));
    }
    const server=await serverFor(scripts);
    try{
      const native=await browserText(server.url+'/native/index.html');
      assert.equal(native,'22');
      for(const mode of ['coo','sco'])
        assert.equal(await browserText(server.url+'/'+mode+'/index.html'),native,
          mode+' real Chromium native-emitted parity on external window host');
    } finally {
      await server.close();
    }
  }
);
