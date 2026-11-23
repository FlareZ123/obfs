'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);

/** @typedef {{path:string,code:string|Buffer,sourceType:'script'|'module'|'asset'}} Source */

/** @returns {Source[]} */
function fixture(){
  const client='document.documentElement.dataset.dynamicUrlSri="loaded";'+
    'globalThis.dynamicUrlSri="source pinned under opaque URL-safe SRI token nonce 1";';
  const hash=createHash('sha512').update(client).digest('base64url');
  const factory='export function build(){return document.createElement("script");}';
  const bootstrap='import {build} from "./factory.mjs";'+
    'const script=build();script.src="./client.js";'+
    'const attr=globalThis.opaqueIntegrityName||"integrity";'+
    'script[attr]="sha512-'+hash+'";document.head.append(script);';
  const html='<!doctype html><html><head>'+
    '<script type="module" src="./bootstrap.mjs"></script>'+
    '</head><body><p>Cross-file DOM integrity</p></body></html>';
  return [
    {path:'client.js',code:client,sourceType:'script'},
    {path:'factory.mjs',code:factory,sourceType:'module'},
    {path:'bootstrap.mjs',code:bootstrap,sourceType:'module'},
    {path:'index.html',code:Buffer.from(html),sourceType:'asset'}
  ];
}

/**
 * An imported factory's returned script element may be hash-pinned by a
 * computed property in another ESM module. Test actual browser SRI parity.
 * @returns {Promise<{nativeLoaded:true,protectedLoaded:true,unsafeBlocked:true}>}
 */
async function main(){
  const sources=fixture();
  const options={mode:/** @type {const} */('coo'),closedWorld:true,
    strings:true,identifiers:false,properties:false,seed:'interfile-dom-sri-browser'};
  const guarded=obfuscateFiles(sources,options);
  // Intentionally retain the vulnerable compiler output for browser contrast.
  const sourceDigest=createHash('sha512').update(sources[0].code).digest('base64url');
  assert.match(sourceDigest.slice(0,8),/[-_]/u);
  const unsafe=obfuscateFiles([sources[0]],options);
  assert.notEqual(unsafe.files[0].code,sources[0].code);
  /** @type {Map<string,Map<string,string>>} */
  const variants=new Map();
  for(const name of ['native','protected','unsafe']){
    const client=name==='protected'?guarded.files[0].code:
      name==='unsafe'?unsafe.files[0].code:sources[0].code;
    const files=new Map([
      ['client.js',/** @type {string} */(client)],
      ['factory.mjs',/** @type {string} */(sources[1].code)],
      ['bootstrap.mjs',/** @type {string} */(sources[2].code)],
      ['index.html',Buffer.from(sources[3].code).toString('utf8')]
    ]);
    variants.set(name,files);
  }
  const server=http.createServer((request,response)=>{
    const parts=(new URL(request.url??'/', 'http://127.0.0.1')).pathname
      .split('/').filter(Boolean);
    const body=parts.length===2?variants.get(parts[0])?.get(parts[1]):undefined;
    if(body===undefined){
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200,{'content-type':parts[1].endsWith('.html')?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const addr=server.address();
    if(!addr||typeof addr==='string')throw new Error('Missing HTTP port');
    const origin='http://127.0.0.1:'+addr.port;
    /** @type {Map<string,boolean>} */
    const seen=new Map();
    for(const name of variants.keys()){
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=10000','--dump-dom',
        origin+'/'+name+'/index.html'
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      assert.match(stdout,/Cross-file DOM integrity/u);
      seen.set(name,/data-dynamic-url-sri="loaded"/u.test(stdout));
    }
    process.stdout.write('DYNAMIC_URLSAFE_SRI_OBSERVED '+JSON.stringify(Object.fromEntries(seen))+'\n');
    assert.equal(seen.get('native'),true,
      'A native imported factory must yield a valid SRI script');
    assert.equal(seen.get('protected'),true,
      'The compiled group must preserve original script bytes');
    assert.equal(seen.get('unsafe'),false,
      'Forced source mutation must fail browser SRI');
    const result={nativeLoaded:/** @type {const} */(true),
      protectedLoaded:/** @type {const} */(true),
      unsafeBlocked:/** @type {const} */(true)};
    process.stdout.write('INTERFILE_DYNAMIC_URLSAFE_SRI_BROWSER '+JSON.stringify(result)+'\n');
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
