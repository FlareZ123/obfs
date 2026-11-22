'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const chrome=promisify(execFile);
/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @returns {SourceFile[]} */
function graph(){
  return [
    {path:'worker.js',sourceType:'script',code:
      'importScripts("./side.js");'+
      'import("./target.mjs").then(({default:value})=>postMessage(value));'},
    {path:'target.mjs',sourceType:'module',
      code:"export default 'protected-literal-value';"}
  ];
}

/** @returns {string} */
function hostPage(){
  return '<!doctype html><html><meta charset="utf-8"><pre id="result"></pre>'+
    '<script>const worker=new Worker("./worker.js");'+
    'worker.onmessage=event=>{document.getElementById("result").textContent=btoa(event.data);worker.terminate();};'+
    'worker.onerror=event=>{document.getElementById("result").textContent=btoa("WORKER_ERROR:"+event.message);};'+
    '</script></html>';
}

/**
 * Classic Worker importScripts executes a same-origin host resource before
 * a later dynamic target module. The mutator was deliberately omitted from
 * the compiler's declared JavaScript group.
 * @returns {Promise<{browser:'Chromium',native:string,transformed:string,encodedLiterals:number}>}
 */
async function main(){
  const input=graph();
  const emitted=obfuscateFiles(input,{
    mode:'coo',strings:true,properties:false,identifiers:false,
    seed:'worker-importscripts-foreign-sideeffect'
  });
  const target=emitted.files.find(file=>file.path==='target.mjs');
  assert.ok(target && target.metrics.literals>0,
    'Expected compiler to encode before it tracks this unlisted importScripts() load');
  /** @type {Map<string,string>} */
  const assets=new Map();
  for(const [name,files] of /** @type {const} */ ([['native',input],['emitted',emitted.files]])){
    const base='/'+name+'/';
    for(const file of files)assets.set(base+file.path,String(file.code));
    assets.set(base+'side.js','String.fromCharCode=()=>"?";');
    assets.set(base+'index.html',hostPage());
  }
  const server=http.createServer((req,res)=>{
    const name=new URL(req.url??'/','http://127.0.0.1').pathname;
    const source=assets.get(name);
    if(source===undefined){res.writeHead(404).end();return;}
    res.writeHead(200,{
      'content-type':name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    res.end(source);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const addr=server.address();
    if(!addr||typeof addr==='string')throw Error('No HTTP port');
    /** @type {Record<string,string>} */
    const outputs={};
    for(const name of ['native','emitted']){
      const url='http://127.0.0.1:'+addr.port+'/'+name+'/index.html';
      const {stdout}=await chrome(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=20000','--dump-dom',url
      ],{encoding:'utf8',timeout:45000,maxBuffer:5*1024*1024});
      const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
      assert.ok(encoded,name+' no browser result '+stdout.slice(0,1200));
      outputs[name]=Buffer.from(encoded,'base64').toString('utf8');
    }
    assert.equal(outputs.native,'protected-literal-value');
    assert.equal(outputs.emitted,'?'.repeat(outputs.native.length),
      'Untracked importScripts mutator did not reproduce target decoder corruption');
    const report={
      browser:/** @type {const} */('Chromium'),
      native:outputs.native,
      transformed:outputs.emitted,
      encodedLiterals:target.metrics.literals
    };
    console.log('IMPORTSCRIPTS_WORKER_COUNTEREXAMPLE '+JSON.stringify(report));
    return report;
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
