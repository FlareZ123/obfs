'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

/** @param {string} binary @param {string} url @returns {Promise<string>} */
async function dumpDom(binary,url) {
  const {stdout}=await promisify(execFile)(binary,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=5500','--dump-dom',url
  ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
  return stdout;
}

/**
 * Compare a restrictive CSP denying Wasm compilation against the same
 * source with a targeted wasm-unsafe-eval allowance. JS ESM loads normally
 * in either case. The protected function is invoked once after import.
 * @returns {Promise<void>}
 */
async function main() {
  const source='export function f(x){return (((x^137)&(x>>>3))|(x<<7));}';
  const generated=obfuscateFiles([{
    path:'kernel.mjs',sourceType:'module',code:source
  }],{mode:'coo',seed:'wasm-csp-real-chromium',strings:false,properties:false,
    identifiers:false,experimentalWasmI32:{'kernel.mjs':['f']}});
  assert.equal(generated.files[0].metrics.wasmI32Functions,1);
  const entry=[
    "import {f as native} from '/native.mjs';",
    "const element=document.getElementById('answer');",
    "try {",
    "  const {f}=await import('/encoded.mjs');",
    "  const a=native(31),b=f(31);",
    "  element.textContent=a===b?'allowed:'+b:'mismatch:'+a+':'+b;",
    "} catch(error) {",
    "  element.textContent='blocked:'+error.name;",
    "}"
  ].join('\n');
  const html='<!doctype html><html><body><div id="answer">pending</div>'+
    '<script type="module" src="/entry.mjs"></script></body></html>';
  /** @type {Map<string,{body:string,type:string}>} */
  const files=new Map([
    ['/strict.html',{body:html,type:'text/html; charset=utf-8'}],
    ['/permissive.html',{body:html,type:'text/html; charset=utf-8'}],
    ['/entry.mjs',{body:entry,type:'text/javascript; charset=utf-8'}],
    ['/native.mjs',{body:source,type:'text/javascript; charset=utf-8'}],
    ['/encoded.mjs',{body:String(generated.files[0].code),type:'text/javascript; charset=utf-8'}]
  ]);
  const server=http.createServer((request,response)=>{
    const selected=files.get(request.url??'');
    if(!selected) {response.writeHead(404).end();return;}
    const strict=request.url==='/strict.html';
    const csp="script-src 'self'"+(strict?'':" 'wasm-unsafe-eval'")+"; object-src 'none'";
    response.writeHead(200,{'Content-Type':selected.type,
      'Content-Security-Policy':csp,'Cache-Control':'no-store'});
    response.end(selected.body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
  try {
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const root='http://127.0.0.1:'+address.port;
    const chrome=process.env.CHROMIUM_BIN??'chromium';
    const strict=await dumpDom(chrome,root+'/strict.html');
    const permissive=await dumpDom(chrome,root+'/permissive.html');
    const outcome=/** @param {string} html */ html=>
      html.match(/id="answer">([^<]+)<\/div>/u)?.[1]??'missing';
    const denied=outcome(strict),allowed=outcome(permissive);
    assert.match(denied,/^blocked:(CompileError|SecurityError)$/u);
    const expected=(((31^137)&(31>>>3))|(31<<7));
    assert.equal(allowed,'allowed:'+expected);
    console.log(JSON.stringify({browser:'chromium',policyBlocked:denied,
      policyWasmAllowed:allowed}));
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
