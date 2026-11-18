'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {buildArxModuleBytes,nativeMix,createFusedArxKernel}=
  require('../sims/fused-arx-batch');

/**
 * Deliberately modify the fixed public Wasm kernel's return state by
 * instrumenting the runtime, without editing the shipped JS or Wasm source.
 * This is an attacker test, not a proposed tamper-defense mechanism.
 *
 * @returns {Promise<void>}
 */
async function main(){
  const bytes=buildArxModuleBytes();
  const binarySha=createHash('sha256').update(bytes).digest('hex');
  assert.equal(binarySha,
    'c2e9f1fbf85505a43681f0a09da9c0ebe9b7eeb9f067b69cd8320b703d8df88d');
  const seed=[-2147483648,17,0x7fffffff,123];
  const units=[0,65,0xd800,0xdc00,65535,13,0];
  const expected=nativeMix(seed,Uint16Array.from(units));
  const poisoned=[0x44332211|0,0x78563412|0,-123456789,0x6eadbeef|0];
  const source='const createFusedArxKernel='+createFusedArxKernel.toString()+';\n'+
    'const bytes=Uint8Array.from('+JSON.stringify([...bytes])+');\n'+
    'const state='+JSON.stringify(seed)+';\n'+
    'const units=Uint16Array.from('+JSON.stringify(units)+');\n'+
    'try{const result=createFusedArxKernel(bytes).mix(state,units);'+
    'document.getElementById("out").textContent=JSON.stringify(result);'+
    '}catch(error){document.getElementById("out").textContent="error:"+String(error);}\n';
  const html='<!doctype html><html><meta charset="utf-8"><body>'+
    '<pre id="out">pending</pre><script type="module" src="/app.mjs"></script>'+
    '</body></html>';
  const sourceSha=createHash('sha256').update(source).digest('hex');
  let scriptRequests=0;
  const server=http.createServer((request,response)=>{
    if(request.url==='/app.mjs'){
      scriptRequests++;
      response.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8',
        'Cache-Control':'no-store'}).end(source);
      return;
    }
    if(request.url==='/index.html'){
      response.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'no-store'}).end(html);
      return;
    }
    response.writeHead(404).end();
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']
    });
    const version=await browser.version();
    const url='http://127.0.0.1:'+address.port+'/index.html';

    /** @param {import('puppeteer-core').Page} page @returns {Promise<number[]>} */
    async function result(page){
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
      await page.waitForFunction(()=>
        document.getElementById('out')?.textContent!=='pending',{timeout:30000});
      const text=await page.$eval('#out',element=>element.textContent??'');
      const parsed=JSON.parse(text);
      assert.ok(Array.isArray(parsed));
      return /** @type {number[]} */(parsed);
    }

    const baseline=await browser.newPage();
    const actual=await result(baseline);
    assert.deepEqual(actual,expected,'Unmodified app must match JS reference');
    await baseline.close();

    const compromised=await browser.newPage();
    await compromised.evaluateOnNewDocument(poison=>{
      const original=globalThis.WebAssembly;
      const Substitute=new Proxy(original.Instance,{
        construct(ctor,args,newTarget){
          const real=Reflect.construct(ctor,args,newTarget);
          const exports=real.exports;
          const memory=/** @type {WebAssembly.Memory} */(exports.memory);
          const alternate={...exports,
            mix(){
              const view=new DataView(memory.buffer);
              for(let index=0;index<4;index++)
                view.setInt32(index*4,poison[index],true);
            }
          };
          const realm=/** @type {typeof globalThis & {__wasmTamperCount?:number}} */ (globalThis);
          realm.__wasmTamperCount=(realm.__wasmTamperCount??0)+1;
          return new Proxy(real,{
            get(target,name,receiver){
              if(name==='exports')return alternate;
              return Reflect.get(target,name,receiver);
            }
          });
        }
      });
      globalThis.WebAssembly=new Proxy(original,{
        get(target,name){
          if(name==='Instance')return Substitute;
          return Reflect.get(target,name,target);
        }
      });
    },poisoned);
    const modified=await result(compromised);
    const interceptions=await compromised.evaluate(()=>
      (/** @type {typeof globalThis & {__wasmTamperCount?:number}} */(globalThis))
        .__wasmTamperCount??0);
    assert.equal(interceptions,1);
    assert.deepEqual(modified,poisoned,
      'Unaltered published script must accept the hostile runtime substitute');
    assert.notDeepEqual(modified,actual);
    assert.equal(scriptRequests,2,
      'Both pages must load the exact same unchanged published JS');
    console.log('FUSED_ARX_BROWSER_RUNTIME_TAMPER '+JSON.stringify({
      chromeVersion:version,sourceSha256:sourceSha,wasmSha256:binarySha,
      scriptRequests,instanceInterceptions:interceptions,
      baselineState:actual,tamperedState:modified,
      publishedBytesChanged:false,
      limitation:'fixed unprotected Wasm pilot; demonstrated runtime substitution, no domain-lock or full-app tamper bypass'
    }));
    await compromised.close();
  }finally{
    if(browser)await browser.close();
    if(server.listening)await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
