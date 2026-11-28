'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src');

/**
 * Actual Chromium CSS.escape invokes the Web IDL DOMString conversion of
 * the supplied function. A source-changing transform must not expose a
 * different escaped Function#toString result.
 * @returns {Promise<void>}
 */
async function main(){
  const native='export function f(x){return x^17;}';
  const counterfactual=lowerWasmI32Functions(native,'module',{
    seed:'css-browser-counterfactual',names:['f']
  });
  assert.equal(counterfactual.functions,1,'The counterfactual must rewrite');
  const positiveNative=native+'\nexport const primitive=CSS.escape("ordinary value");';
  const positive=obfuscateFiles([{
    path:'positive.mjs',sourceType:'module',code:positiveNative
  }],{
    mode:'coo',seed:'css-browser-primitive',strings:false,identifiers:false,
    experimentalWasmI32:{'positive.mjs':['f']}
  });
  assert.match(String(positive.files[0].code),/WebAssembly/,
    'A primitive CSS.escape call must retain nonvacuous Wasm selection');
  const negative=native+'\nexport const originalSource=CSS.escape(f);';
  assert.throws(()=>obfuscateFiles([{
    path:'negative.mjs',sourceType:'module',code:negative
  }],{
    mode:'coo',seed:'css-browser-source',strings:false,identifiers:false,
    experimentalWasmI32:{'negative.mjs':['f']}
  }),/Wasm|source|declined/i);

  const html=[
    '<!doctype html><meta charset="utf-8"><pre id="result">pending</pre>',
    '<script type="module">try {',
    'if(typeof CSS.escape!=="function")throw Error("CSS.escape absent");',
    'const [n,w,p,q]=await Promise.all([',
    'import("/native.mjs"),import("/lowered.mjs"),',
    'import("/positive-native.mjs"),import("/positive-compiled.mjs")]);',
    'const observedNative=CSS.escape(n.f);',
    'const observedLowered=CSS.escape(w.f);',
    'if(observedNative===observedLowered)',
    'throw Error("No actual CSS source observer counterfactual");',
    'if(!observedNative.includes("17")||!observedNative.includes("return"))',
    'throw Error("CSS did not expose function source");',
    'if(n.f(7)!==w.f(7)||p.f(7)!==q.f(7)||p.primitive!==q.primitive)',
    'throw Error("Numeric or primitive parity broken");',
    'document.getElementById("result").textContent="PASS CSS.escape source";',
    '}catch(error){',
    'document.getElementById("result").textContent="FAIL "+String(error.stack||error);',
    '}</script>'
  ].join('\n');
  const routes=new Map([
    ['/',html],['/native.mjs',native],
    ['/lowered.mjs',counterfactual.code],
    ['/positive-native.mjs',positiveNative],
    ['/positive-compiled.mjs',String(positive.files[0].code)]
  ]);
  const server=http.createServer((request,response)=>{
    const pathname=request.url??'';
    const body=routes.get(pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':pathname==='/'?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected TCP address');
    const url='http://127.0.0.1:'+address.port+'/';
    const chrome=process.env.CHROMIUM_BIN??'chromium';
    const args=['--headless','--no-sandbox','--disable-gpu',
      '--disable-dev-shm-usage','--no-first-run',
      '--virtual-time-budget=4500','--dump-dom',url];
    const {stdout,stderr}=await promisify(execFile)(chrome,args,{
      timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'
    });
    assert.match(stdout,/<pre id="result">PASS CSS\.escape source<\/pre>/,
      String(stderr));
    console.log(JSON.stringify({browser:'Chromium',
      counterfactualRewritten:counterfactual.functions,
      positiveWasmRetained:true,nativeEmittedParity:'PASS',
      sourceObservationCounterfactual:'different'}));
  }finally{
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
