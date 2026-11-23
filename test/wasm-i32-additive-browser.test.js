'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {recoverPublicWasmExpression}=require('../sims/wasm-i32-static-recover');

test('real Chromium ESM matches source and public-bytecode clone for coerced addition',{
  skip:process.platform==='win32'?'Chromium runner is Unix-only':false,
  timeout:60000
},async()=>{
  const source='export function f(a,b){return ((a+b)|0)^(a>>>5);}';
  const emitted=lowerWasmI32Functions(source,'module',{
    seed:'real-chromium-coerced-addition',names:['f']
  });
  assert.equal(emitted.functions,1);
  const recovered=recoverPublicWasmExpression(emitted.code,['a','b']);
  const cloned='export function f(a,b){return '+recovered.expression+';}';
  const script=[
    'import {f as native} from "/native.mjs";',
    'import {f as wasm} from "/wasm.mjs";',
    'import {f as reconstructed} from "/clone.mjs";',
    'let checked=0;',
    'try {',
    ' for(let i=0;i<2000;i++){',
    '  const a=Math.imul(i^0x4c957f2d,1664525)|0;',
    '  const b=Math.imul(i+0x7f4a7c15,1013904223)|0;',
    '  const expected=native(a,b);',
    '  if(!Object.is(wasm(a,b),expected)||',
    '     !Object.is(reconstructed(a,b),expected))',
    '    throw Error("native/Wasm/clone mismatch "+i);',
    '  checked++;',
    ' }',
    ' document.getElementById("answer").textContent="pass:"+checked;',
    '}catch(error){',
    ' document.getElementById("answer").textContent="fail:"+String(error);',
    '}'
  ].join('\n');
  const html='<!doctype html><html><meta charset="utf-8">'+
    '<body><div id="answer">pending</div><script type="module" src="/runner.mjs"></script></body></html>';
  const assets=new Map([
    ['/index.html',{type:'text/html; charset=utf-8',body:html}],
    ['/runner.mjs',{type:'text/javascript; charset=utf-8',body:script}],
    ['/native.mjs',{type:'text/javascript; charset=utf-8',body:source}],
    ['/wasm.mjs',{type:'text/javascript; charset=utf-8',body:emitted.code}],
    ['/clone.mjs',{type:'text/javascript; charset=utf-8',body:cloned}]
  ]);
  const server=http.createServer((request,response)=>{
    const item=assets.get(request.url??'');
    if(!item){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':item.type,
      'cache-control':'no-store',
      'content-security-policy':"script-src 'self' 'wasm-unsafe-eval'"
    });
    response.end(item.body);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    /** @type {Promise<void>} */
    const listening=new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve());
    });
    await listening;
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const version=await browser.version();
    const tab=await browser.newPage();
    await tab.goto('http://127.0.0.1:'+address.port+'/index.html',{
      waitUntil:'domcontentloaded',timeout:45000
    });
    await tab.waitForFunction(()=>{
      const text=document.getElementById('answer')?.textContent??'';
      return text.startsWith('pass:')||text.startsWith('fail:');
    },{timeout:40000,polling:50});
    const observed=await tab.$eval('#answer',element=>element.textContent??'');
    assert.equal(observed,'pass:2000',observed);
    console.log(JSON.stringify({browser:version,mode:'ESM',nativeWasmClone:3,
      identicalInputs:2000,wasmBytes:emitted.wasmBytes,
      note:'real Chromium parity; no security or universal budget claim'}));
  }finally{
    try{if(browser)await browser.close();}
    finally{
      /** @type {Promise<void>} */
      const closing=new Promise((resolve,reject)=>server.close(error=>
        error?reject(error):resolve()));
      await closing;
    }
  }
});
