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
  const js='document.documentElement.dataset.foreignBaseSri="loaded";'+
    'globalThis.foreignBaseSRI="the live HTML base pins these original source bytes";';
  const digest=createHash('sha256').update(js).digest('base64');
  const html='<!doctype html><html><head><meta charset="utf-8"></head><body>'+
    '<svg><base href="../unrelated/"/></svg>'+
    '<base href="../assets/">'+
    '<script src="./client.js" integrity="sha256-'+digest+'"></script>'+
    '<p>Foreign base SRI document</p></body></html>';
  return [
    {path:'assets/client.js',sourceType:'script',code:js},
    {path:'pages/index.html',sourceType:'asset',code:Buffer.from(html)}
  ];
}

/**
 * The SVG-namespace base is inert for document.baseURI. The later
 * HTML-namespace base makes ./client.js resolve to ../assets/client.js.
 * A false-negative SRI proof would rewrite the protected script and make
 * the real browser reject it.
 * @returns {Promise<{nativeLoaded:true,safeLoaded:true,unsafeBlocked:true}>}
 */
async function main(){
  const originals=originalFiles();
  const options={mode:/** @type {const} */('coo'),strings:true,
    properties:false,identifiers:false};
  const safe=obfuscateFiles(originals,{...options,seed:'foreign-base-safe'});
  assert.equal(safe.files[0].code,originals[0].code);
  const unsafe=obfuscateFiles([originals[0]],{...options,seed:'foreign-base-unsafe'});
  assert.notEqual(unsafe.files[0].code,originals[0].code);

  const html=Buffer.from(originals[1].code).toString('utf8');
  /** @type {Map<string,Map<string,string>>} */
  const variants=new Map([
    ['native',new Map([
      ['assets/client.js',/** @type {string} */(originals[0].code)],
      ['pages/index.html',html]
    ])],
    ['safe',new Map([
      ['assets/client.js',/** @type {string} */(safe.files[0].code)],
      ['pages/index.html',html]
    ])],
    ['unsafe',new Map([
      ['assets/client.js',/** @type {string} */(unsafe.files[0].code)],
      ['pages/index.html',html]
    ])]
  ]);
  const server=http.createServer((request,response)=>{
    const pieces=(new URL(request.url??'/', 'http://127.0.0.1')).pathname
      .split('/').filter(Boolean);
    const content=pieces.length===3?
      variants.get(pieces[0])?.get(pieces.slice(1).join('/')):undefined;
    if(content===undefined){
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200,{'content-type':pieces[2].endsWith('.html')?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(content);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing test HTTP port');
    const origin='http://127.0.0.1:'+address.port;
    /** @type {Map<string,boolean>} */
    const loaded=new Map();
    for(const variant of ['native','safe','unsafe']){
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=10000','--dump-dom',
        origin+'/'+variant+'/pages/index.html'
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      assert.match(stdout,/Foreign base SRI document/u);
      loaded.set(variant,/data-foreign-base-sri="loaded"/u.test(stdout));
    }
    assert.equal(loaded.get('native'),true,
      'The browser must recognize the HTML base after the inert foreign base');
    assert.equal(loaded.get('safe'),true,
      'The protected graph must preserve SRI-pinned script bytes');
    assert.equal(loaded.get('unsafe'),false,
      'The counterfactual byte mutation must fail the browser integrity check');
    const result={nativeLoaded:/** @type {const} */ (true),
      safeLoaded:/** @type {const} */ (true),
      unsafeBlocked:/** @type {const} */ (true)};
    process.stdout.write('FOREIGN_BASE_SRI_BROWSER '+JSON.stringify(result)+'\n');
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
