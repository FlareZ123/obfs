'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const http=require('node:http');
const {promisify}=require('node:util');
const {execFile}=require('node:child_process');
const {createScoHandler}=require('../src');

const runBrowser=promisify(execFile);

/**
 * @param {'native'|'protected'|'unsafe'} kind
 * @param {string} integrity
 * @returns {string}
 */
function documentHtml(kind,integrity) {
  return '<!doctype html><html><body>'+
    '<script src="/'+kind+'/obfs%23/client.js" integrity="'+integrity+'"></script>'+
    '<p>SCO percent-encoded mount integrity</p></body></html>';
}

/**
 * The public URL keeps %23 inside a configured route prefix. The SCO handler
 * must preserve a script's SRI-pinned source bytes while returning different
 * byte spellings if the HTML SRI observer is deliberately omitted.
 * @returns {Promise<{nativeLoaded:true,safeLoaded:true,unsafeBlocked:true}>}
 */
async function main(){
  const js='document.documentElement.dataset.encodedRouteSri="loaded";'+
    'globalThis.encodedRouteSRI="the original response must stay SRI valid";';
  const integrity='sha256-'+createHash('sha256').update(js).digest('base64');
  const protectedHandler=createScoHandler([
    {path:'client.js',sourceType:'script',code:js},
    {path:'index.html',sourceType:'asset',
      code:Buffer.from(documentHtml('protected',integrity))}
  ],{routePrefix:'/protected/obfs%23/'});
  const unsafeHandler=createScoHandler([
    {path:'client.js',sourceType:'script',code:js}
  ],{routePrefix:'/unsafe/obfs%23/'});

  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/', 'http://127.0.0.1').pathname;
    if(pathname.startsWith('/protected/obfs%23/')){
      protectedHandler(request,response);
      return;
    }
    if(pathname==='/unsafe/obfs%23/index.html'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(documentHtml('unsafe',integrity));
      return;
    }
    if(pathname.startsWith('/unsafe/obfs%23/')){
      unsafeHandler(request,response);
      return;
    }
    if(pathname==='/native/obfs%23/index.html'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(documentHtml('native',integrity));
      return;
    }
    if(pathname==='/native/obfs%23/client.js'){
      response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
      response.end(js);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing HTTP port');
    const origin='http://127.0.0.1:'+address.port;
    const nativeReply=await fetch(origin+'/native/obfs%23/client.js');
    const protectedReply=await fetch(origin+'/protected/obfs%23/client.js');
    const unsafeReply=await fetch(origin+'/unsafe/obfs%23/client.js');
    assert.equal(nativeReply.status,200);
    assert.equal(protectedReply.status,200);
    assert.equal(unsafeReply.status,200);
    assert.equal(await nativeReply.text(),js);
    assert.equal(await protectedReply.text(),js);
    assert.notEqual(await unsafeReply.text(),js);

    /** @type {Map<string,boolean>} */
    const observed=new Map();
    for(const variant of ['native','protected','unsafe']){
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=10000','--dump-dom',
        origin+'/'+variant+'/obfs%23/index.html'
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      assert.match(stdout,/SCO percent-encoded mount integrity/u);
      observed.set(variant,/data-encoded-route-sri="loaded"/u.test(stdout));
    }
    assert.equal(observed.get('native'),true);
    assert.equal(observed.get('protected'),true);
    assert.equal(observed.get('unsafe'),false);
    const result={nativeLoaded:/** @type {const} */(true),
      safeLoaded:/** @type {const} */(true),
      unsafeBlocked:/** @type {const} */(true)};
    process.stdout.write('SCO_ENCODED_ROUTE_SRI_BROWSER '+JSON.stringify(result)+'\n');
    return result;
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main};
