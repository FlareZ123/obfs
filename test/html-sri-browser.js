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
  const js='document.documentElement.dataset.sri="loaded";'+
    'globalThis.sriOutput="an unchanged source-boundary canary string";';
  const integrity=createHash('sha256').update(js).digest('base64');
  const html='<!doctype html><html><head><meta charset="utf-8">'+
    '<script src="./client.js" integrity="sha256-'+integrity+'"></script>'+
    '</head><body><p>Script integrity test</p></body></html>';
  return [
    {path:'client.js',sourceType:'script',code:js},
    {path:'index.html',sourceType:'asset',code:Buffer.from(html)}
  ];
}

/**
 * The third graph deliberately compiles the script without its SRI-pinned HTML,
 * showing that it would still be rewritten if the integrity reader were absent.
 * @returns {Promise<{nativeLoaded:true,safeLoaded:true,unsafeBlocked:true,
 *   nativeBytes:number,unsafeBytes:number}>}
 */
async function main(){
  const originals=originalFiles();
  const safe=obfuscateFiles(originals,{
    mode:'coo',seed:'sri-browser-complete-graph',
    strings:true,properties:false,identifiers:false
  });
  assert.equal(safe.files[0].code,originals[0].code);
  const unsafe=obfuscateFiles([originals[0]],{
    mode:'coo',seed:'sri-browser-unsafe-counterfactual',
    strings:true,properties:false,identifiers:false
  });
  assert.notEqual(unsafe.files[0].code,originals[0].code);
  const html=Buffer.from(originals[1].code).toString('utf8');
  /** @type {Map<string,Map<string,string>>} */
  const variants=new Map([
    ['native',new Map([['client.js',/** @type {string} */(originals[0].code)],['index.html',html]])],
    ['safe',new Map([['client.js',/** @type {string} */(safe.files[0].code)],['index.html',html]])],
    ['unsafe',new Map([['client.js',/** @type {string} */(unsafe.files[0].code)],['index.html',html]])]
  ]);
  const server=http.createServer((request,response)=>{
    const parts=(new URL(request.url??'/', 'http://127.0.0.1')).pathname
      .split('/').filter(Boolean);
    const content=parts.length===2?variants.get(parts[0])?.get(parts[1]):null;
    if(content===undefined||content===null){
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200,{'content-type':parts[1].endsWith('.html')?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(content);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing local server port');
    const origin='http://127.0.0.1:'+address.port;
    /** @type {Map<string,boolean>} */
    const loaded=new Map();
    for(const variant of ['native','safe','unsafe']){
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=10000','--dump-dom',
        origin+'/'+variant+'/index.html'
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      assert.match(stdout,/Script integrity test/u);
      loaded.set(variant,/data-sri="loaded"/u.test(stdout));
    }
    assert.equal(loaded.get('native'),true);
    assert.equal(loaded.get('safe'),true);
    assert.equal(loaded.get('unsafe'),false,
      'A byte-mutating edit should be rejected by the browser SRI check');
    const nativeBytes=Buffer.byteLength(/** @type {string} */ (originals[0].code));
    const unsafeBytes=Buffer.byteLength(/** @type {string} */ (unsafe.files[0].code));
    const result={
      nativeLoaded:/** @type {const} */(true),
      safeLoaded:/** @type {const} */(true),
      unsafeBlocked:/** @type {const} */(true),nativeBytes,unsafeBytes
    };
    process.stdout.write('SRI_BROWSER '+JSON.stringify(result)+'\n');
    return result;
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main};
