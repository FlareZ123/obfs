'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const http=require('node:http');
const {promisify}=require('node:util');
const {execFile}=require('node:child_process');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);

/** @typedef {{path:string,sourceType:'script'|'asset',code:string|Buffer}} File */

/** @returns {File[]} */
function originals(){
  const script='document.documentElement.dataset.dynamicScriptSri="loaded";'+
    'globalThis.dynamicScriptSRI="this client source is SRI-pinned by a JS loader";';
  const integrity=createHash('sha256').update(script).digest('base64');
  const bootstrap='const element=document.createElement("script");'+
    'element.src="./client.js";element.integrity="sha256-'+integrity+'";'+
    'document.head.append(element);';
  const html='<!doctype html><html><head><script src="./bootstrap.js"></script>'+
    '</head><body><p>Dynamic integrity script test</p></body></html>';
  return [
    {path:'client.js',sourceType:'script',code:script},
    {path:'bootstrap.js',sourceType:'script',code:bootstrap},
    {path:'index.html',sourceType:'asset',code:Buffer.from(html)}
  ];
}

/**
 * Dynamic HTMLScriptElement.integrity pins an otherwise separately rewritable
 * script even with no static SRI attribute in the supplied HTML assets.
 * @returns {Promise<{nativeLoaded:true,safeLoaded:true,unsafeBlocked:true}>}
 */
async function main(){
  const files=originals();
  const options={mode:/** @type {const} */('coo'),strings:true,
    identifiers:false,properties:false};
  const safe=obfuscateFiles(files,{...options,seed:'dynamic-dom-sri-safe'});
  assert.equal(safe.files[0].code,files[0].code);
  const unsafe=obfuscateFiles([files[0]],{...options,seed:'dynamic-dom-sri-unsafe'});
  assert.notEqual(unsafe.files[0].code,files[0].code);
  const html=Buffer.from(files[2].code).toString('utf8');
  /** @type {Map<string,Map<string,string>>} */
  const variants=new Map([
    ['native',new Map([
      ['client.js',/** @type {string} */(files[0].code)],
      ['bootstrap.js',/** @type {string} */(files[1].code)],['index.html',html]
    ])],
    ['safe',new Map([
      ['client.js',/** @type {string} */(safe.files[0].code)],
      ['bootstrap.js',/** @type {string} */(safe.files[1].code)],['index.html',html]
    ])],
    ['unsafe',new Map([
      ['client.js',/** @type {string} */(unsafe.files[0].code)],
      ['bootstrap.js',/** @type {string} */(files[1].code)],['index.html',html]
    ])]
  ]);
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
  try{
    const addr=server.address();
    if(!addr||typeof addr==='string')throw new Error('Missing HTTP port');
    const origin='http://127.0.0.1:'+addr.port;
    /** @type {Map<string,boolean>} */
    const observed=new Map();
    for(const variant of ['native','safe','unsafe']){
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=10000','--dump-dom',
        origin+'/'+variant+'/index.html'
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      assert.match(stdout,/Dynamic integrity script test/u);
      observed.set(variant,/data-dynamic-script-sri="loaded"/u.test(stdout));
    }
    assert.equal(observed.get('native'),true,
      'Native dynamic integrity script must load its SRI-valid client');
    assert.equal(observed.get('safe'),true,
      'The compiled graph must keep the dynamically pinned script byte-exact');
    assert.equal(observed.get('unsafe'),false,
      'A byte-changing counterfactual must fail native SRI');
    const result={nativeLoaded:/** @type {const} */(true),
      safeLoaded:/** @type {const} */(true),
      unsafeBlocked:/** @type {const} */(true)};
    process.stdout.write('DYNAMIC_SCRIPT_SRI_BROWSER '+JSON.stringify(result)+'\n');
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
