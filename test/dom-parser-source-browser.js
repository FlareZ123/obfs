'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src');

/**
 * Real DOMParser parses the DOMString-converted function, providing a
 * distinct runtime source-read boundary from CSS.escape and response blobs.
 * @returns {Promise<void>}
 */
async function main(){
  const original='export function inspect(x){return x^17;}';
  const lowered=lowerWasmI32Functions(original,'module',{
    seed:'domparser-browser-counterfactual',names:['inspect']
  });
  assert.equal(lowered.functions,1,'The counterfactual must actually lower');
  const negative=original+
    '\nexport const captured=new DOMParser().parseFromString(inspect,"text/html").body.textContent;';
  assert.throws(()=>obfuscateFiles([{
    path:'negative.mjs',sourceType:'module',code:negative
  }],{
    mode:'coo',seed:'domparser-browser-negative',
    identifiers:false,strings:false,properties:false,
    experimentalWasmI32:{'negative.mjs':['inspect']}
  }),/Wasm|declined|source/i);

  const positiveNative=original+
    '\nexport const parsed=new DOMParser().parseFromString("ordinary","text/html").body.textContent;';
  const positive=obfuscateFiles([{
    path:'positive.mjs',sourceType:'module',code:positiveNative
  }],{
    mode:'coo',seed:'domparser-browser-positive',
    identifiers:false,strings:false,properties:false,
    experimentalWasmI32:{'positive.mjs':['inspect']}
  });
  assert.match(String(positive.files[0].code),/WebAssembly/,
    'Primitive DOMParser input must keep selected WASM yield');

  const html=[
    '<!doctype html><meta charset="utf-8"><pre id="result">pending</pre>',
    '<script type="module">try {',
    'const [n,w,p,q]=await Promise.all([',
    'import("/native.mjs"),import("/lowered.mjs"),',
    'import("/positive-native.mjs"),import("/positive-compiled.mjs")]);',
    'const parser=new DOMParser();',
    'const first=parser.parseFromString(n.inspect,"text/html").body.textContent;',
    'const second=parser.parseFromString(w.inspect,"text/html").body.textContent;',
    'if(!first.includes("return x^17;")||first===second)',
    'throw Error("Native DOMParser source witness absent");',
    'if(n.inspect(7)!==w.inspect(7)||p.inspect(7)!==q.inspect(7)||',
    'p.parsed!==q.parsed||p.parsed!=="ordinary")',
    'throw Error("Numeric or primitive DOMParser parity broken");',
    'document.getElementById("result").textContent="PASS DOMParser source";',
    '}catch(error){',
    'document.getElementById("result").textContent="FAIL "+String(error.stack||error);',
    '}</script>'
  ].join('\n');
  const routes=new Map([
    ['/',html],['/native.mjs',original],
    ['/lowered.mjs',lowered.code],
    ['/positive-native.mjs',positiveNative],
    ['/positive-compiled.mjs',String(positive.files[0].code)]
  ]);
  const server=http.createServer((request,response)=>{
    const route=request.url??'';
    const body=routes.get(route);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':route==='/'?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected TCP server');
    const chrome=process.env.CHROMIUM_BIN??'chromium';
    const args=['--headless','--no-sandbox','--disable-gpu',
      '--disable-dev-shm-usage','--no-first-run',
      '--virtual-time-budget=4500','--dump-dom',
      'http://127.0.0.1:'+address.port+'/'];
    const {stdout,stderr}=await promisify(execFile)(chrome,args,{
      timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'
    });
    assert.match(stdout,/<pre id="result">PASS DOMParser source<\/pre>/,
      String(stderr));
    console.log(JSON.stringify({browser:'Chromium',loweredFunctions:lowered.functions,
      nativeSourceObserver:'DOMParser',counterfactualDiffers:true,
      positiveWasm:true,positiveParity:true}));
  }finally{
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
