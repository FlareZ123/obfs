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
    {path:'entry.mjs',sourceType:'module',code:
      'import "./side.mjs";import value from "./target.mjs";globalThis.answer=value;'},
    {path:'side.mjs',sourceType:'module',code:'export const harmless=true;'},
    {path:'target.mjs',sourceType:'module',
      code:"export default 'protected-literal-value';"}
  ];
}

/** @param {boolean} map @returns {string} */
function html(map){
  const nonce='fixture-nonce';
  const rule=JSON.stringify({imports:{'./side.mjs':'./host-mutator.mjs'}});
  return '<!doctype html><html><head><meta charset="utf-8">'+
    (map?'<script nonce="'+nonce+'" type="importmap">'+rule+'</script>':'')+
    '</head><body><pre id="result"></pre>'+
    '<script nonce="'+nonce+'" type="module">'+
    'try{await import("./entry.mjs");'+
    'document.getElementById("result").textContent=btoa(globalThis.answer);'+
    '}catch(error){document.getElementById("result").textContent=btoa(String(error.stack||error));}'+
    '</script></body></html>';
}

/**
 * A host-owned same-origin module remaps a known static dependency under
 * CSP script-src 'self'. Input JS files are complete but host HTML and
 * import maps lie outside the obfuscator's declared compilation group.
 *
 * @returns {Promise<{browser:'Chromium',csp:string,plainParity:true,original:string,remappedEmitted:string,protectedLiterals:number}>}
 */
async function main(){
  const input=graph();
  const output=obfuscateFiles(input,{
    mode:'coo',strings:true,identifiers:false,properties:false,
    seed:'local-host-importmap-csp'
  });
  const target=output.files.find(file=>file.path==='target.mjs');
  assert.ok(target&&target.metrics.literals>0,'Input group failed to encode known target');
  const csp="script-src 'self' 'nonce-fixture-nonce'; object-src 'none'; base-uri 'none'";
  /** @type {Map<string,string>} */
  const resources=new Map();
  for(const [variant,files] of /** @type {const} */ ([['native',input],['emitted',output.files]])){
    for(const state of ['plain','mapped']) {
      const base='/'+variant+'/'+state+'/';
      for(const file of files)resources.set(base+file.path,String(file.code));
      resources.set(base+'host-mutator.mjs',
        'String.fromCharCode=()=>"?";export const executed=true;');
      resources.set(base+'index.html',html(state==='mapped'));
    }
  }
  const server=http.createServer((req,res)=>{
    const name=new URL(req.url??'/','http://127.0.0.1').pathname;
    const body=resources.get(name);
    if(body===undefined){res.writeHead(404).end();return;}
    res.writeHead(200,{
      'content-type':name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'content-security-policy':csp,
      'cache-control':'no-store'
    });
    res.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const addr=server.address();
    if(!addr||typeof addr==='string')throw Error('Missing server address');
    /** @type {Record<string,string>} */
    const outputs={};
    for(const variant of ['native','emitted'])for(const state of ['plain','mapped']) {
      const url='http://127.0.0.1:'+addr.port+'/'+variant+'/'+state+'/index.html';
      const {stdout}=await chrome(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=12000','--dump-dom',url
      ],{encoding:'utf8',timeout:45000,maxBuffer:5*1024*1024});
      const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
      assert.ok(encoded,'No output from '+variant+'/'+state+': '+stdout.slice(0,1200));
      outputs[variant+'/'+state]=Buffer.from(encoded,'base64').toString('utf8');
    }
    assert.equal(outputs['native/plain'],'protected-literal-value');
    assert.equal(outputs['emitted/plain'],outputs['native/plain']);
    assert.equal(outputs['native/mapped'],'protected-literal-value');
    assert.equal(outputs['emitted/mapped'],'?'.repeat(outputs['native/mapped'].length),
      'The local remapped module must poison only the emitted decoder');
    const report={
      browser:/** @type {const} */('Chromium'),csp,
      plainParity:/** @type {const} */(true),
      original:outputs['native/mapped'],
      remappedEmitted:outputs['emitted/mapped'],
      protectedLiterals:target.metrics.literals
    };
    console.log('CSP_LOCAL_IMPORTMAP_COUNTEREXAMPLE '+JSON.stringify(report));
    return report;
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
