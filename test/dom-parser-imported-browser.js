'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} File */
/**
 * Real-browser integration for a bound DOMParser.parseFromString method
 * exported by a distinct module and imported via static and top-level
 * literal-dynamic imports. Actual native Web IDL conversion and Document
 * parsing happen in Chromium, not in a fake Node host.
 * @returns {Promise<void>}
 */
async function main(){
  const methods='const p=new DOMParser();'+
    'export const parse=p.parseFromString.bind(p);';
  const functionSource='export function f(x){return x^17;}';
  /** @type {Array<[string,string]>} */
  const imports=[
    ['static','import {parse as parseHtml} from "./methods.mjs";'],
    ['dynamic','const {parse:parseHtml}=await import("./methods.mjs");']
  ];
  /** @type {Map<string,string>} */
  const files=new Map([['/methods.mjs',methods]]);
  for(const [name,prefix] of imports){
    const observed=prefix+functionSource+
      'export const source=parseHtml(f,"text/html").body.textContent;';
    const primitive=prefix+functionSource+
      'export const source=parseHtml("literal","text/html").body.textContent;';
    /** @type {File[]} */
    const graph=[{path:'methods.mjs',sourceType:'module',code:methods},
      {path:'compiled.mjs',sourceType:'module',code:observed}];
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      assert.throws(()=>obfuscateFiles(graph,{
        mode,seed:'dom-browser-imported-native/'+name+'/'+mode,
        identifiers:false,strings:false,properties:false,
        experimentalWasmI32:{'compiled.mjs':['f']}
      }),/Wasm|source|declined/i);
    }
    const positive=obfuscateFiles([
      {path:'methods.mjs',sourceType:'module',code:methods},
      {path:'compiled.mjs',sourceType:'module',code:primitive}
    ],{
      mode:'coo',seed:'dom-browser-imported-primitive/'+name,
      identifiers:false,strings:false,properties:false,
      experimentalWasmI32:{'compiled.mjs':['f']}
    });
    const compiled=positive.files.find(file=>file.path==='compiled.mjs');
    assert.ok(compiled);
    assert.match(String(compiled.code),/WebAssembly/);
    files.set('/'+name+'-source.mjs',observed);
    files.set('/'+name+'-native.mjs',primitive);
    files.set('/'+name+'-compiled.mjs',String(compiled.code));
  }
  const html=[
    '<!doctype html><meta charset="utf-8"><pre id="result">pending</pre>',
    '<script type="module">try {',
    'for(const kind of ["static","dynamic"]){',
    'const [n,p,q]=await Promise.all([',
    'import("/"+kind+"-source.mjs"),import("/"+kind+"-native.mjs"),',
    'import("/"+kind+"-compiled.mjs")]);',
    'const parser=new DOMParser();',
    'const native=parser.parseFromString(n.f,"text/html").body.textContent;',
    'if(!n.source.includes("return x^17;")||n.source!==native)',
    'throw Error("imported native source mismatch: "+kind);',
    'if(p.f(7)!==q.f(7)||p.source!==q.source||q.source!=="literal")',
    'throw Error("primitive emitted mismatch: "+kind);',
    '}',
    'document.getElementById("result").textContent="PASS imported DOMParser";',
    '}catch(error){document.getElementById("result").textContent=',
    '"FAIL "+String(error.stack||error);}</script>'
  ].join('\n');
  files.set('/',html);
  const server=http.createServer((req,res)=>{
    const uri=req.url??'';
    const data=files.get(uri);
    if(data===undefined){res.writeHead(404).end();return;}
    res.writeHead(200,{'content-type':uri==='/'?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    res.end(data);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected TCP address');
    const chrome=process.env.CHROMIUM_BIN??'chromium';
    const {stdout,stderr}=await promisify(execFile)(chrome,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=6000','--dump-dom',
      'http://127.0.0.1:'+address.port+'/'
    ],{timeout:60000,maxBuffer:8*1024*1024,encoding:'utf8'});
    assert.match(stdout,/<pre id="result">PASS imported DOMParser<\/pre>/,
      String(stderr));
    console.log(JSON.stringify({
      browser:'Chromium',nativeMethod:'DOMParser.parseFromString',
      importedMethodKinds:['static','literal-dynamic'],
      sourceObserver:'PASS',primitiveWasmYield:'PASS',
      primitiveNativeEmittedParity:'PASS'
    }));
  }finally{
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
