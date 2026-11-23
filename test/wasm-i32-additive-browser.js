'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {recoverPublicWasmExpression}=require('../sims/wasm-i32-static-recover');

/** 
 * Run real Chromium ESM parity and paired warm CPU cost independently of the
 * thousands of generic `npm test` Node workers. This is a browser gate,
 * not a universally valid 2.5x runtime acceptance test.
 * @returns {Promise<void>}
 */
async function main(){
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
    'const rows=Array.from({length:2048},(_,i)=>[',
    ' Math.imul(i^0x4c957f2d,1664525)|0,',
    ' Math.imul(i+0x7f4a7c15,1013904223)|0',
    ']);',
    'function makeWork(fn){return function work(rounds){',
    ' let checksum=0;',
    ' for(let i=0;i<rounds;i++){',
    '  const r=rows[i&2047];checksum^=fn(r[0],r[1]);',
    ' }',
    ' return checksum|0;',
    '};}',
    'const work={native:makeWork(native),wasm:makeWork(wasm),',
    ' reconstructed:makeWork(reconstructed)};',
    'const names=["native","wasm","reconstructed"];',
    'const expected=work.native(120000);',
    'for(let warm=0;warm<6;warm++)for(const name of names){',
    ' if(work[name](120000)!==expected)throw Error("warm checksum mismatch "+name);',
    '}',
    'const benchmarkExpected=work.native(180000);',
    'const measures={native:[],wasm:[],reconstructed:[]};',
    'const orders=[["native","wasm","reconstructed"],',
    ' ["reconstructed","wasm","native"],',
    ' ["wasm","native","reconstructed"]];',
    'for(let trial=0;trial<13;trial++){',
    ' for(const name of orders[trial%3]){',
    '  const start=performance.now();',
    '  const result=work[name](180000);',
    '  const time=performance.now()-start;',
    '  if(result!==benchmarkExpected||!Number.isFinite(time)||time<=0)',
    '    throw Error("browser timing invalid "+name);',
    '  measures[name].push(time);',
    ' }',
    '}',
    'const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];',
    'const browserRatio=median(measures.wasm)/median(measures.native);',
    'document.getElementById("answer").textContent="pass:"+JSON.stringify({',
    ' checked,measurements:measures,browserRatio,',
    ' note:"paired selected hot function, not a universal budget" ',
    '});',
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
    assert.ok(observed.startsWith('pass:'),observed);
    const details=/** @type {{
      checked:number,browserRatio:number,
      measurements:{native:number[],wasm:number[],reconstructed:number[]},
      note:string
    }} */(JSON.parse(observed.slice(5)));
    assert.equal(details.checked,2000);
    assert.ok(Number.isFinite(details.browserRatio)&&details.browserRatio>0);
    for(const samples of Object.values(details.measurements)){
      assert.equal(samples.length,13);
      assert.ok(samples.every(value=>Number.isFinite(value)&&value>0));
    }
    console.log(JSON.stringify({browser:version,mode:'ESM',nativeWasmClone:3,
      identicalInputs:2000,wasmBytes:emitted.wasmBytes,
      hotRatio:details.browserRatio,measurements:details.measurements,
      scope:'selected Chromium warm function, not universal 2.5x or security'}));
  }finally{
    try{if(browser)await browser.close();}
    finally{
      /** @type {Promise<void>} */
      const closing=new Promise((resolve,reject)=>server.close(error=>
        error?reject(error):resolve()));
      await closing;
    }
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
