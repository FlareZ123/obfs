'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @param {string} binary @param {string} url @returns {Promise<string>} */
async function dumpDom(binary,url) {
  const {stdout}=await promisify(execFile)(binary,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=5000','--dump-dom',url
  ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
  return stdout;
}

/**
 * Run real browser ESM imports and host-page API calls. All differential
 * inputs are signed Int32 Numbers under the experimental backend's contract.
 * Browser performance is diagnostic and must be evaluated per workload.
 * @returns {Promise<void>}
 */
async function main() {
  const source='export function scramble(x){return (((x^137)&(x>>>3))|(x<<7));}';
  const built=obfuscateFiles([{path:'scramble.mjs',sourceType:'module',code:source}],{
    mode:'coo',seed:'wasm-i32-browser-2026-11-15',
    strings:false,properties:false,identifiers:false,
    experimentalWasmI32:{'scramble.mjs':['scramble']}
  });
  assert.equal(built.files[0].metrics.wasmI32Functions,1);
  const transformed=String(built.files[0].code);
  assert.ok(transformed.includes('WebAssembly.Module('));

  const page='<!doctype html><html><body><div id="answer">pending</div>'+
    '<script>window.externalBridge={accept:function(x){'+
    'document.getElementById("answer").textContent=x;}};</script>'+
    '<script type="module">'+
    'import {scramble as native} from "/native.mjs";'+
    'import {scramble as encoded} from "/encoded.mjs";'+
    'let compared=0;for(let i=-2048;i<=2048;i++){'+
    'const a=native(i),b=encoded(i);'+
    'if(!Object.is(a,b))throw Error("i32 mismatch "+i);compared++;}'+
    'function work(fn){let value=0;for(let i=0;i<200000;i++)'+
    'value^=fn((i*1664525)|0);return value;}'+
    'for(let k=0;k<5;k++){if(work(native)!==work(encoded))throw Error("warm mismatch");}'+
    'let t=performance.now();const expected=work(native);const nativeMs=performance.now()-t;'+
    't=performance.now();const actual=work(encoded);const encodedMs=performance.now()-t;'+
    'if(expected!==actual)throw Error("hot checksum mismatch");'+
    'window.externalBridge.accept("pass:"+compared+":"+nativeMs+":"+encodedMs);'+
    '</script></body></html>';
  const assets=new Map([
    ['/index.html',{type:'text/html; charset=utf-8',body:page}],
    ['/native.mjs',{type:'text/javascript; charset=utf-8',body:source}],
    ['/encoded.mjs',{type:'text/javascript; charset=utf-8',body:transformed}]
  ]);
  const server=http.createServer((request,response)=>{
    const selected=assets.get(request.url??'');
    if(!selected){response.writeHead(404).end();return;}
    response.writeHead(200,{'Content-Type':selected.type,'Cache-Control':'no-store'});
    response.end(selected.body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
  try {
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const url='http://127.0.0.1:'+address.port+'/index.html';
    const html=await dumpDom(process.env.CHROMIUM_BIN??'chromium',url);
    const match=html.match(/id="answer">pass:(\d+):([0-9.]+):([0-9.]+)/u);
    assert.ok(match,'Chromium ESM graph did not complete: '+html.slice(-2000));
    assert.equal(Number(match[1]),4097);
    const nativeMs=Number(match[2]),wasmMs=Number(match[3]);
    assert.ok(nativeMs>=0&&wasmMs>=0);
    console.log(JSON.stringify({browser:'chromium',inputs:4097,nativeMs,wasmMs,
      hotRatio:wasmMs/nativeMs}));
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
