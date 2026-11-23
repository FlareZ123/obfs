'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const execFileAsync=promisify(execFile);

/** @returns {Promise<{nativeLoaded:true,safeLoaded:true,unsafeBlocked:true}>} */
async function main(){
  const library='export const value="source-bound import-map-integrity module";';
  const consumer='import {value} from "library";'+
    'document.documentElement.dataset.importmap='+
    'value==="source-bound import-map-integrity module"?"loaded":"wrong";';
  const integrity='sha256-'+createHash('sha256').update(library).digest('base64');
  const html='<!doctype html><html><head><meta charset="utf-8">'+
    '<script type="importmap">'+JSON.stringify({
      imports:{library:'./library.mjs'},
      integrity:{'./library.mjs':integrity}
    })+'</script></head><body><p>Import map integrity test</p>'+
    '<script type="module" src="./consumer.mjs"></script></body></html>';
  /** @type {{path:string,sourceType:'module'|'asset',code:string|Buffer}[]} */
  const originals=[
    {path:'library.mjs',sourceType:'module',code:library},
    {path:'consumer.mjs',sourceType:'module',code:consumer},
    {path:'index.html',sourceType:'asset',code:Buffer.from(html)}
  ];
  const safe=obfuscateFiles(originals,{
    mode:'coo',seed:'importmap-integrity-browser-guarded',
    strings:true,properties:false,identifiers:false
  });
  assert.equal(safe.files[0].code,library,'the reviewed import map pins module bytes');
  const unsafe=obfuscateFiles([originals[0]],{
    mode:'coo',seed:'importmap-integrity-browser-counterfactual',
    strings:true,properties:false,identifiers:false
  });
  assert.notEqual(unsafe.files[0].code,library,
    'without the HTML manifest the same module is actually transformed');
  /** @type {Map<string,Map<string,string>>} */
  const variants=new Map([
    ['native',new Map([['library.mjs',library],['consumer.mjs',consumer],['index.html',html]])],
    ['safe',new Map([['library.mjs',String(safe.files[0].code)],
      ['consumer.mjs',String(safe.files[1].code)],['index.html',html]])],
    ['unsafe',new Map([['library.mjs',String(unsafe.files[0].code)],
      ['consumer.mjs',consumer],['index.html',html]])]
  ]);
  const server=http.createServer((request,response)=>{
    const parts=new URL(request.url??'/', 'http://127.0.0.1').pathname
      .split('/').filter(Boolean);
    const source=parts.length===2?variants.get(parts[0])?.get(parts[1]):undefined;
    if(source===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':parts[1].endsWith('.html')?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(source);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing TCP port');
    const origin='http://127.0.0.1:'+address.port;
    /** @type {Map<string,boolean>} */
    const loaded=new Map();
    for(const variant of ['native','safe','unsafe']){
      const {stdout}=await execFileAsync(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=8000','--dump-dom',
        origin+'/'+variant+'/index.html'
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      assert.match(stdout,/Import map integrity test/u);
      loaded.set(variant,/data-importmap="loaded"/u.test(stdout));
    }
    assert.equal(loaded.get('native'),true,'native import map must load');
    assert.equal(loaded.get('safe'),true,'byte-preserved compiled module must load');
    assert.equal(loaded.get('unsafe'),false,
      'Chrome must reject the otherwise equivalent byte-mutating output');
    const result={
      nativeLoaded:/** @type {const} */(true),
      safeLoaded:/** @type {const} */(true),
      unsafeBlocked:/** @type {const} */(true)
    };
    process.stdout.write('IMPORTMAP_INTEGRITY_BROWSER '+JSON.stringify(result)+'\n');
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
