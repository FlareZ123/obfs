'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const runChrome=promisify(execFile);
/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * @param {boolean} external
 * @returns {SourceFile[]}
 */
function graph(external) {
  const poisoned='data:text/javascript,'+
    encodeURIComponent('String.fromCharCode=()=>"?";');
  const before=external?'await import('+JSON.stringify(poisoned)+');':'';
  return [
    {path:'entry.mjs',sourceType:'module',code:before+
      'const {default:value}=await import("./target.mjs");'+
      'document.getElementById("result").textContent=btoa(value);'},
    {path:'target.mjs',sourceType:'module',
      code:"export default 'protected-literal-value';"}
  ];
}

/**
 * Test real Chromium's module linker, not a simulated Node global.
 * @returns {Promise<{browser:'Chromium',scenarios:number,externalRefusals:number,localEncoded:number}>}
 */
async function main() {
  /** @type {Map<string,string>} */
  const resources=new Map();
  /** @type {Array<{name:string,external:boolean}>} */
  const cases=[
    {name:'external',external:true},
    {name:'local',external:false}
  ];
  let externalRefusals=0;
  let localEncoded=0;
  for(const item of cases) {
    const original=graph(item.external);
    const emitted=obfuscateFiles(original,{
      mode:'coo',strings:true,properties:false,identifiers:false,
      seed:'dynamic-data-esm-browser/'+item.name
    });
    const protectedTarget=emitted.files.find(file=>file.path==='target.mjs');
    assert.ok(protectedTarget,'Missing transformed target');
    if(item.external) {
      assert.equal(protectedTarget.metrics.literals,0);
      externalRefusals++;
    } else {
      assert.ok(protectedTarget.metrics.literals>0,
        'Known relative import should retain positive literal rewrite coverage');
      localEncoded+=protectedTarget.metrics.literals;
    }
    for(const [variant,files] of /** @type {const} */ ([['original',original],['emitted',emitted.files]])) {
      const root='/'+item.name+'/'+variant+'/';
      for(const file of files)resources.set(root+file.path,String(file.code));
      resources.set(root+'index.html',
        '<!doctype html><html><meta charset="utf-8">'+
        '<pre id="result"></pre><script type="module" src="./entry.mjs"></script></html>');
    }
  }
  const server=http.createServer((request,response)=>{
    const name=new URL(request.url??'/','http://127.0.0.1').pathname;
    const body=resources.get(name);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('No HTTP port');
    const origin='http://127.0.0.1:'+address.port;
    for(const item of cases) {
      for(const variant of ['original','emitted']) {
        const {stdout}=await runChrome(process.env.CHROMIUM_BIN??'google-chrome',[
          '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
          '--no-first-run','--virtual-time-budget=10000','--dump-dom',
          origin+'/'+item.name+'/'+variant+'/index.html'
        ],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024});
        const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
        assert.ok(encoded,item.name+'/'+variant+' Chrome returned no result: '+stdout.slice(0,1600));
        assert.equal(Buffer.from(encoded,'base64').toString('utf8'),
          'protected-literal-value',item.name+'/'+variant+' differs from native literal');
      }
    }
    const report={browser:/** @type {const} */('Chromium'),
      scenarios:cases.length,externalRefusals,localEncoded};
    process.stdout.write('DYNAMIC_DATA_ESM_CHROME '+JSON.stringify(report)+'\n');
    return report;
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
