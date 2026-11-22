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
function originalFiles(){
  const js='document.documentElement.dataset.hashFilenameSri="loaded";'+
    'globalThis.hashFilenameSRI="source bytes pinned from a path containing a literal hash";';
  const integrity=createHash('sha256').update(js).digest('base64');
  const html='<!doctype html><html><body><script src="../client.js" '+
    'integrity="sha256-'+integrity+'"></script>'+
    '<p>Hashed document path SRI test</p></body></html>';
  return [
    {path:'pages/client.js',sourceType:'script',code:js},
    {path:'pages/hash#inside/index.html',sourceType:'asset',code:Buffer.from(html)}
  ];
}

/**
 * A literal # in a filesystem path becomes %23 in the browser's requested
 * URL. Resolve ../client.js from that complete document directory.
 * @returns {Promise<{nativeLoaded:true,safeLoaded:true,unsafeBlocked:true}>}
 */
async function main(){
  const originals=originalFiles();
  const options={mode:/** @type {const} */('coo'),strings:true,
    identifiers:false,properties:false};
  const safe=obfuscateFiles(originals,{...options,seed:'hash-filename-sri-safe'});
  assert.equal(safe.files[0].code,originals[0].code);
  const unsafe=obfuscateFiles([originals[0]],{...options,seed:'hash-filename-sri-unsafe'});
  assert.notEqual(unsafe.files[0].code,originals[0].code);
  const html=Buffer.from(originals[1].code).toString('utf8');
  /** @type {Map<string,Map<string,string>>} */
  const variants=new Map([
    ['native',new Map([
      ['pages/client.js',/** @type {string} */(originals[0].code)],
      ['pages/hash#inside/index.html',html]
    ])],
    ['safe',new Map([
      ['pages/client.js',/** @type {string} */(safe.files[0].code)],
      ['pages/hash#inside/index.html',html]
    ])],
    ['unsafe',new Map([
      ['pages/client.js',/** @type {string} */(unsafe.files[0].code)],
      ['pages/hash#inside/index.html',html]
    ])]
  ]);
  const server=http.createServer((request,response)=>{
    const parts=(new URL(request.url??'/', 'http://127.0.0.1')).pathname
      .split('/').filter(Boolean);
    const content=parts.length>=3?
      variants.get(parts[0])?.get(decodeURIComponent(parts.slice(1).join('/'))):undefined;
    if(content===undefined){
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200,{'content-type':parts.at(-1)?.endsWith('.html')?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(content);
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
    const loaded=new Map();
    for(const variant of ['native','safe','unsafe']){
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=10000','--dump-dom',
        origin+'/'+variant+'/pages/hash%23inside/index.html'
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      assert.match(stdout,/Hashed document path SRI test/u);
      loaded.set(variant,/data-hash-filename-sri="loaded"/u.test(stdout));
    }
    assert.equal(loaded.get('native'),true,
      'Native browser must fetch the relative script through the encoded document URL');
    assert.equal(loaded.get('safe'),true,
      'Protected output must retain source bytes from a hash-named directory');
    assert.equal(loaded.get('unsafe'),false,
      'An intentionally rewritten script must fail the native SRI check');
    const result={nativeLoaded:/** @type {const} */(true),
      safeLoaded:/** @type {const} */(true),
      unsafeBlocked:/** @type {const} */(true)};
    process.stdout.write('HASH_FILENAME_SRI_BROWSER '+JSON.stringify(result)+'\n');
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
