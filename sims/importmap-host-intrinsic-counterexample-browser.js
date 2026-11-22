'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const chrome=promisify(execFile);
/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * @returns {SourceFile[]}
 */
function suppliedGraph(){
  return [
    {path:'entry.mjs',sourceType:'module',code:
      'import "./side.mjs";import value from "./target.mjs";globalThis.answer=value;'},
    {path:'side.mjs',sourceType:'module',code:'export const inert=17;'},
    {path:'target.mjs',sourceType:'module',
      code:"export default 'protected-literal-value';"}
  ];
}

/**
 * @param {boolean} withImportMap
 * @returns {string}
 */
function page(withImportMap){
  const patch='String.fromCharCode=()=>"?";';
  const importMap=JSON.stringify({imports:{
    './side.mjs':'data:text/javascript,'+encodeURIComponent(patch)
  }});
  return '<!doctype html><html><head><meta charset="utf-8">'+
    (withImportMap?'<script type="importmap">'+importMap+'</script>':'')+
    '</head><body><pre id="result"></pre><script type="module">'+
    'try{await import("./entry.mjs");'+
    'document.getElementById("result").textContent=btoa(globalThis.answer);'+
    '}catch(error){document.getElementById("result").textContent=btoa(String(error.stack||error));}'+
    '</script></body></html>';
}

/**
 * Browser host-provided import maps can redirect a provably supplied static
 * dependency. This is a negative counterexample, not a production patch.
 *
 * @returns {Promise<{browser:'Chromium',unmappedParity:true,nativeWithMap:string,emittedWithMap:string,encodedLiterals:number}>}
 */
async function main(){
  const input=suppliedGraph();
  const transformed=obfuscateFiles(input,{
    mode:'coo',strings:true,properties:false,identifiers:false,
    seed:'browser-unlisted-import-map-intrinsic'
  });
  const target=transformed.files.find(file=>file.path==='target.mjs');
  assert.ok(target && target.metrics.literals>0,
    'Known-graph compiler did not encode the target literal');
  /** @type {Map<string,string>} */
  const resources=new Map();
  for(const [label,files] of /** @type {const} */ ([['native',input],['emitted',transformed.files]])){
    for(const file of files)resources.set('/'+label+'/'+file.path,String(file.code));
    resources.set('/'+label+'/plain/index.html',page(false));
    resources.set('/'+label+'/mapped/index.html',page(true));
  }
  const server=http.createServer((req,res)=>{
    const name=new URL(req.url??'/','http://127.0.0.1').pathname;
    // Module specifiers resolve relative to the HTML directory, so
    // serve each module under both navigation subdirectories.
    const code=resources.get(name) ??
      resources.get(name.replace(/\/(?:plain|mapped)\//u,'/'));
    if(code===undefined){res.writeHead(404).end();return;}
    res.writeHead(200,{
      'content-type':name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    res.end(code);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const addr=server.address();
    if(!addr||typeof addr==='string')throw Error('Missing browser HTTP port');
    const origin='http://127.0.0.1:'+addr.port;
    /** @type {Record<string,string>} */
    const outputs={};
    for(const label of ['native','emitted']){
      for(const state of ['plain','mapped']){
        const {stdout}=await chrome(process.env.CHROMIUM_BIN??'google-chrome',[
          '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
          '--no-first-run','--virtual-time-budget=12000','--dump-dom',
          origin+'/'+label+'/'+state+'/index.html'
        ],{encoding:'utf8',timeout:45000,maxBuffer:5*1024*1024});
        const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
        assert.ok(encoded,label+'/'+state+' no parsed Chrome result: '+stdout.slice(0,1200));
        outputs[label+'/'+state]=Buffer.from(encoded,'base64').toString('utf8');
      }
    }
    assert.equal(outputs['native/plain'],'protected-literal-value');
    assert.equal(outputs['emitted/plain'],outputs['native/plain'],
      'Ordinary supplied graph must retain native/emitted browser parity');
    assert.equal(outputs['native/mapped'],'protected-literal-value');
    assert.notEqual(outputs['emitted/mapped'],outputs['native/mapped'],
      'Import-map remapping must expose the unproved decoder-host assumption');
    const result={
      browser:/** @type {const} */('Chromium'),
      unmappedParity:/** @type {const} */(true),
      nativeWithMap:outputs['native/mapped'],
      emittedWithMap:outputs['emitted/mapped'],
      encodedLiterals:target.metrics.literals
    };
    process.stdout.write('IMPORT_MAP_AMBIENT_DECODER_COUNTEREXAMPLE '+JSON.stringify(result)+'\n');
    return result;
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
}
if(require.main===module)main().catch(err=>{console.error(err);process.exitCode=1;});
module.exports={main};
