'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');
const {reconstructPublicWasmEsm}=require('../sims/wasm-i32-esm-native-rebuild');

/** @typedef {{path:string,sourceType:'module',code:string}} InputFile */
/** @typedef {{path:string,code:string}} File */

/** @type {InputFile[]} */
const graph=[
  {path:'kernel.mjs',sourceType:'module',
    code:'export function scramble(a,b,c,d){return (((a^b)&(c|d))^((a>>>d)|(c<<b)));}'+
      'export function mask(x){return x?((x^137)&255):((~x)|7);}'},
  {path:'bridge.mjs',sourceType:'module',
    code:'export function forward(value,label){return globalThis.externalBridge.deliver(value,label);}'},
  {path:'entry.mjs',sourceType:'module',
    code:'import {scramble,mask} from "./kernel.mjs";'+
      'import {forward} from "./bridge.mjs";'+
      'export function run(a,b,c,d,label){return forward((scramble(a,b,c,d)^mask(a))|0,label);}'}
];

/** @param {string} binary @param {string} url @returns {Promise<string>} */
async function dumpDom(binary,url){
  const {stdout}=await promisify(execFile)(binary,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=5000','--dump-dom',url
  ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
  return stdout;
}

/** @param {boolean} strict @returns {string} */
function runnerSource(strict){
  return '"use strict";\n'+
    'import {run as nativeRun} from "/native/entry.mjs";\n'+
    'import {run as cloneRun} from "/clone/entry.mjs";\n'+
    (strict?'':'import {run as wasmRun} from "/wasm/entry.mjs";\n')+
    'async function main(){\n'+
    'const calls=[];\n'+
    'globalThis.externalBridge={deliver(value,label){calls.push([value,label]);'+
      'return label+":"+(value>>>0).toString(16);}};\n'+
    'const variants=[nativeRun,cloneRun'+(strict?'':',wasmRun')+'];\n'+
    'let checks=0;\n'+
    'for(let i=0;i<512;i++){\n'+
      'const a=(Math.imul(i^0x9bf34621,0x9e3779b1))|0;\n'+
      'const b=Math.imul(i+17,1664525)|0;\n'+
      'const c=Math.imul(i+71,1013904223)|0;\n'+
      'const d=i&31,label="browser-"+i;\n'+
      'let baseline;\n'+
      'for(const fn of variants){\n'+
        'const before=calls.length;\n'+
        'const value=fn(a,b,c,d,label);\n'+
        'const trace=calls.slice(before);\n'+
        'if(trace.length!==1)throw Error("callback-count mismatch "+i);\n'+
        'const observed=JSON.stringify([value,trace]);\n'+
        'if(baseline===undefined)baseline=observed;\n'+
        'else if(observed!==baseline)throw Error("browser parity mismatch "+i);\n'+
      '}\n'+
      'checks++;\n'+
    '}\n'+
    'let csp="allowed";\n'+
    (strict?
      'let denied=false;try{await import("/wasm/entry.mjs");}catch{denied=true;}\n'+
      'if(!denied)throw Error("strict CSP unexpectedly allowed Wasm compilation");\n'+
      'csp="denied";\n':'')+
    'document.getElementById("answer").textContent='+
      '"pass:"+checks+":"+variants.length+":"+csp;\n'+
    '}\n'+
    'main().catch(error=>{document.getElementById("answer").textContent='+
      '"fail:"+String(error&&error.stack||error);});\n';
}

/**
 * Test a public-output-only replacement in real Chromium modules. The strict
 * page deliberately omits wasm-unsafe-eval, denying compiled Wasm, while
 * the detached native reconstruction still runs.
 * @returns {Promise<void>}
 */
async function main(){
  const emitted=obfuscateFiles(graph,{
    mode:'coo',seed:'native-clone-browser-three-file',closedWorld:true,
    strings:false,properties:false,identifiers:false,
    experimentalWasmI32:{'kernel.mjs':['scramble','mask']}
  });
  /** @type {File[]} */
  const published=emitted.files.map(file=>({path:file.path,code:String(file.code)}));
  const kernel=published.find(file=>file.path==='kernel.mjs');
  assert.ok(kernel);
  assert.equal(emitted.files.find(file=>file.path==='kernel.mjs')?.metrics.wasmI32Functions,2);
  const attacker=reconstructPublicWasmEsm(kernel.code);
  assert.equal(attacker.functions.length,2);
  assert.doesNotMatch(attacker.code,/WebAssembly|Uint8Array/u);
  /** @type {File[]} */
  const copied=published.map(file=>file.path==='kernel.mjs'?
    {path:file.path,code:attacker.code}:file);
  /** @type {Map<string,{type:string,body:string,policy?:string}>} */
  const assets=new Map();
  /** @type {Array<[string,File[]]>} */
  const groups=[['native',graph],['wasm',published],['clone',copied]];
  for(const [prefix,files] of groups){
    for(const file of files)assets.set('/'+prefix+'/'+file.path,{
      type:'text/javascript; charset=utf-8',body:file.code
    });
  }
  for(const strict of [false,true]){
    const slug=strict?'strict':'permissive';
    const body='<!doctype html><html><head><meta charset="utf-8"></head><body>'+
      '<div id="answer">pending</div>'+
      '<script type="module" src="/run-'+slug+'.mjs"></script></body></html>';
    assets.set('/'+slug+'.html',{type:'text/html; charset=utf-8',
      body,policy:strict?"script-src 'self'":"script-src 'self' 'wasm-unsafe-eval'"});
    assets.set('/run-'+slug+'.mjs',{type:'text/javascript; charset=utf-8',
      body:runnerSource(strict)});
  }
  const server=http.createServer((request,response)=>{
    const item=assets.get(request.url??'');
    if(!item){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'Content-Type':item.type,
      'Cache-Control':'no-store',
      ...(item.policy?{'Content-Security-Policy':item.policy}:{})
    });
    response.end(item.body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
  try{
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    for(const strict of [false,true]){
      const url='http://127.0.0.1:'+address.port+'/'+(strict?'strict':'permissive')+'.html';
      const html=await dumpDom(process.env.CHROMIUM_BIN??'chromium',url);
      const expected='pass:512:'+(strict?'2:denied':'3:allowed');
      assert.ok(html.includes('id="answer">'+expected+'</div>'),
        'Browser graph '+(strict?'strict':'permissive')+' did not pass: '+html.slice(-1600));
      console.log(JSON.stringify({
        browser:'chromium',mode:strict?'strict-CSP':'wasm-allowed',
        cases:512,variants:strict?2:3,
        wasmDeniedByCsp:strict,nativeCloneWorks:true
      }));
    }
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
