'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {test}=require('node:test');
const puppeteer=require('puppeteer-core');
const {transform}=require('esbuild');
const {obfuscateFiles}=require('../src');

const original=[
  'const value=Promise.resolve().then(()=>{',
  'const localSecret=17;return localSecret;',
  '});document.body.textContent=JSON.stringify(value);'
].join('\n');

test('real Chromium COO source preservation under host-patched Promise.then',async t=>{
  if(process.platform==='win32') {
    t.skip('Chrome browser binary is configured on the Ubuntu validation lane');
    return;
  }

  const transformed=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:original}],{
    mode:'coo',seed:'real-chromium-promise-host-source',
    closedWorld:true,identifiers:true,properties:false,strings:false
  }).files[0];
  assert.ok(transformed.metrics.bindings>0,'Require an actual renamed private identifier');

  const minified=(await transform(original,{
    loader:'js',target:'es2022',minify:true,legalComments:'none'
  })).code;
  /** @type {Map<string,string>} */
  const files=new Map([
    ['/native.mjs',original],
    ['/compiled.mjs',transformed.code],
    ['/ordinary.mjs',minified],
    ['/host.js','Promise.prototype.then=function(callback){'+
      'return [String(callback).includes("localSecret"),callback()];};']
  ]);
  const server=http.createServer((request,response)=>{
    const url=new URL(request.url??'/','http://localhost');
    if(request.method!=='GET') {response.writeHead(405).end();return;}
    if(['/native.html','/compiled.html','/ordinary.html'].includes(url.pathname)) {
      const kind=url.pathname.slice(1,-5);
      response.writeHead(200,{
        'content-type':'text/html; charset=utf-8',
        'content-security-policy':"default-src 'self'; script-src 'self'; connect-src 'self'",
        'cache-control':'no-store'
      });
      response.end('<!doctype html><html><body>'+
        '<script src="/host.js"></script>'+
        '<script type="module" src="/'+kind+'.mjs"></script></body></html>');
      return;
    }
    const js=files.get(url.pathname);
    if(js===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':'text/javascript; charset=utf-8',
      'cache-control':'no-store','x-content-type-options':'nosniff'
    });
    response.end(js);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,args:['--no-sandbox','--disable-gpu',
        '--disable-dev-shm-usage','--no-first-run']
    });

    /**
     * @param {'native'|'compiled'|'ordinary'} kind
     * @returns {Promise<[boolean,number]>}
     */
    async function run(kind){
      assert.ok(browser);
      const page=await browser.newPage();
      /** @type {string[]} */
      const errors=[];
      page.on('pageerror',e=>errors.push(String(e)));
      try {
        await page.goto(origin+'/'+kind+'.html',{
          waitUntil:'networkidle0',timeout:45000
        });
        const value=await page.evaluate(()=>document.body.textContent);
        assert.ok(value,'No browser module output: '+errors.join(' | '));
        return JSON.parse(value);
      }finally{await page.close();}
    }
    const native=await run('native');
    const compiled=await run('compiled');
    const ordinary=await run('ordinary');
    process.stdout.write('PROMISE_HOST_SOURCE_CHROMIUM '+JSON.stringify({
      native,compiled,ordinary,bindings:transformed.metrics.bindings
    })+'\n');
    assert.deepEqual(native,[true,17]);
    assert.deepEqual(compiled,native,'COO compilation changed host-observed callback source');
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
});
