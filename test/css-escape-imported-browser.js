'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} File */
/**
 * Verify that native CSS.escape still exposes the original source through a
 * *separately imported native method*. The actual Web IDL conversion runs
 * in Chromium; the test never replaces CSS.escape with a JS host mock.
 * @returns {Promise<void>}
 */
async function main(){
  const methods='export const escape=CSS.escape;';
  const base='export function f(x){return x^17;}';
  const staticPrelude='import {escape as cssEscape} from "./methods.mjs";';
  const dynamicPrelude='const {escape:cssEscape}=await import("./methods.mjs");';
  /** @type {Array<[string,string]>} */
  const cases=[['static',staticPrelude],['dynamic',dynamicPrelude]];
  /** @type {Map<string,string>} */
  const routes=new Map([['/methods.mjs',methods]]);
  for(const [kind,prefix] of cases){
    const native=prefix+base+
      'export const source=cssEscape(f);';
    const primitive=prefix+base+
      'export const source=cssEscape("literal");';
    /** @type {File[]} */
    const sourceFiles=[
      {path:'methods.mjs',sourceType:'module',code:methods},
      {path:'compiled.mjs',sourceType:'module',code:native}
    ];
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      assert.throws(()=>obfuscateFiles(sourceFiles,{
        mode,seed:'browser-imported-css-negative/'+kind+'/'+mode,
        identifiers:false,strings:false,properties:false,
        experimentalWasmI32:{'compiled.mjs':['f']}
      }),/Wasm|source|declined/i,kind+' '+mode+' must reject native CSS source change');
    }
    const positive=obfuscateFiles([
      {path:'methods.mjs',sourceType:'module',code:methods},
      {path:'compiled.mjs',sourceType:'module',code:primitive}
    ],{
      mode:'coo',seed:'browser-imported-css-primitive/'+kind,
      identifiers:false,strings:false,properties:false,
      experimentalWasmI32:{'compiled.mjs':['f']}
    });
    const compiled=positive.files.find(file=>file.path==='compiled.mjs');
    assert.ok(compiled);
    assert.match(String(compiled.code),/WebAssembly/,
      'CSS primitive must retain real Wasm lowering');
    routes.set('/'+kind+'-source.mjs',native);
    routes.set('/'+kind+'-native.mjs',primitive);
    routes.set('/'+kind+'-compiled.mjs',String(compiled.code));
  }
  const page=[
    '<!doctype html><meta charset="utf-8"><pre id="result">pending</pre>',
    '<script type="module">try {',
    'if(typeof CSS.escape!=="function")throw Error("native CSS.escape absent");',
    'for(const kind of ["static","dynamic"]) {',
    'const [n,p,q]=await Promise.all([',
    'import("/"+kind+"-source.mjs"),import("/"+kind+"-native.mjs"),',
    'import("/"+kind+"-compiled.mjs")]);',
    'if(!n.source.includes("return x^17;")||',
    'n.source!==CSS.escape(n.f))throw Error("native imported source: "+kind);',
    'if(p.f(7)!==q.f(7)||p.source!==q.source)',
    'throw Error("primitive emitted parity: "+kind);',
    '}',
    'document.getElementById("result").textContent="PASS imported CSS";',
    '}catch(error){document.getElementById("result").textContent=',
    '"FAIL "+String(error.stack||error);}</script>'
  ].join('\n');
  routes.set('/',page);
  const server=http.createServer((req,res)=>{
    const name=req.url??'';
    const body=routes.get(name);
    if(body===undefined){res.writeHead(404).end();return;}
    res.writeHead(200,{'content-type':name==='/'?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    res.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected TCP server');
    const chrome=process.env.CHROMIUM_BIN??'chromium';
    const args=['--headless','--no-sandbox','--disable-gpu',
      '--disable-dev-shm-usage','--no-first-run','--virtual-time-budget=6000',
      '--dump-dom','http://127.0.0.1:'+address.port+'/'];
    const {stdout,stderr}=await promisify(execFile)(chrome,args,{
      timeout:60000,maxBuffer:8*1024*1024,encoding:'utf8'
    });
    assert.match(stdout,/<pre id="result">PASS imported CSS<\/pre>/,
      String(stderr));
    console.log(JSON.stringify({
      browser:'Chromium',nativeMethod:'CSS.escape',
      importedMethodKinds:['static','literal-dynamic'],
      sourceObserver:'PASS',primitiveWasmYield:'PASS',
      primitiveNativeEmittedParity:'PASS'
    }));
  }finally{
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
main().catch(err=>{console.error(err);process.exitCode=1;});
