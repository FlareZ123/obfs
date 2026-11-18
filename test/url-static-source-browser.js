'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const {lowerWasmI32Functions}=require('../src/wasm-i32');

/** @typedef {{path:string,sourceType:'module',code:string}} ESMFile */

const logic='export function inspect(a){return a^17;}';
const observed='import {inspect} from "./logic.mjs";'+
  'export function observe(){return {text:URL.parse(inspect,"https://example.test/").href,'+
  'value:inspect(31)};}';
const primitive='import {inspect} from "./logic.mjs";'+
  'export function observe(){return {text:URL.parse("/fixed","https://example.test/").href,'+
  'value:inspect(31)};}';
const lowered=lowerWasmI32Functions(logic,'module',{
  seed:'chrome-url-parser-source-counterfactual',names:['inspect']
});
assert.equal(lowered.functions,1,'Browser witness requires an actual Wasm source change');

/** @param {string} text @returns {ESMFile[]} */
function files(text) {
  return [
    {path:'logic.mjs',sourceType:'module',code:logic},
    {path:'observer.mjs',sourceType:'module',code:text}
  ];
}
assert.throws(()=>obfuscateFiles(files(observed),{
  mode:'coo',seed:'chrome-url-observer-refusal',
  closedWorld:true,strings:false,
  experimentalWasmI32:{'logic.mjs':['inspect']}
}),/Wasm i32 requires|declined/i,
'Browser-source-observing module must prohibit explicitly selected Wasm');

const compiled=obfuscateFiles(files(primitive),{
  mode:'coo',seed:'chrome-url-primitive-positive',
  closedWorld:true,strings:false,
  experimentalWasmI32:{'logic.mjs':['inspect']}
});
assert.equal(compiled.files[0].metrics.wasmI32Functions,1,
  'Literal URL parsing must retain an actually selected Wasm function');

const page=[
  '<!doctype html><html><head><meta charset="utf-8"></head><body>',
  '<pre id="result">pending</pre><script type="module">',
  'try {',
  'if(typeof URL.parse!=="function")throw Error("Chromium lacks URL.parse");',
  'const [a,b,c,d]=await Promise.all([',
  'import("/source/observer.mjs"),import("/lowered/observer.mjs"),',
  'import("/primitive/observer.mjs"),import("/compiled/observer.mjs")]);',
  'const native=a.observe(),lowered=b.observe(),plain=c.observe(),compiled=d.observe();',
  'if(!native.text.includes("inspect")||!native.text.includes("return"))',
  'throw Error("Native Chrome URL parser did not expose function source");',
  'if(native.text===lowered.text)',
  'throw Error("Wasm lowering did not change actual Chrome URL output");',
  'if(JSON.stringify(plain)!==JSON.stringify(compiled))',
  'throw Error("Selected primitive Wasm changed output "+JSON.stringify({plain,compiled}));',
  'document.getElementById("result").textContent="PASS Chrome URL.parse source witness";',
  '}catch(error){document.getElementById("result").textContent="FAIL "+String(error.stack||error);}',
  '</script></body></html>'
].join('\n');

const bodies=new Map([
  ['/',page],
  ['/source/logic.mjs',logic],
  ['/source/observer.mjs',observed],
  ['/lowered/logic.mjs',lowered.code],
  ['/lowered/observer.mjs',observed],
  ['/primitive/logic.mjs',logic],
  ['/primitive/observer.mjs',primitive],
  ['/compiled/logic.mjs',String(compiled.files[0].code)],
  ['/compiled/observer.mjs',String(compiled.files[1].code)]
]);

/** @returns {Promise<void>} */
async function main() {
  const server=http.createServer((request,response)=>{
    const body=bodies.get(request.url??'');
    if(body===undefined){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':request.url==='/'?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const addr=server.address();
    if(!addr||typeof addr==='string')throw Error('Expected local TCP address');
    const url='http://127.0.0.1:'+addr.port+'/';
    const chrome=process.env.CHROMIUM_BIN??'chromium';
    const {stdout,stderr}=await promisify(execFile)(chrome,[
      '--headless','--no-sandbox','--disable-gpu',
      '--disable-dev-shm-usage','--no-first-run',
      '--virtual-time-budget=4500','--dump-dom',url
    ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
    assert.match(stdout,
      /<pre id="result">PASS Chrome URL\.parse source witness<\/pre>/u,
      String(stderr));
    console.log(JSON.stringify({browser:'Chromium',api:'URL.parse',
      nativeLoweredSourceDifferential:'different',
      selectedWasmObserver:'declined',
      selectedWasmLiteral:'admitted',
      selectedWasmLiteralParity:'PASS'}));
  } finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
