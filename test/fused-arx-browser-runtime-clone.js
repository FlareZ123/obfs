'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const puppeteer=require('puppeteer-core');
const {buildArxModuleBytes,nativeMix,createFusedArxKernel}=
  require('../sims/fused-arx-batch');

const expectedSha='c2e9f1fbf85505a43681f0a09da9c0ebe9b7eeb9f067b69cd8320b703d8df88d';

/** @param {number} number @returns {number} */
function next(number){number^=number<<13;number^=number>>>17;number^=number<<5;return number|0;}

/**
 * Capture a real browser's actually compiled Wasm bytes at document start,
 * then replay the same bytes in a separate origin containing no candidate
 * compiler. This is a hostile-DevTools experiment, not a protection feature.
 * @returns {Promise<void>}
 */
async function main(){
  const moduleBytes=buildArxModuleBytes();
  const digest=createHash('sha256').update(moduleBytes).digest('hex');
  assert.equal(digest,expectedSha);
  const originalSeed=[-2147483648,17,0x7fffffff,123];
  const originalUnits=[0,65,0xd800,0xdc00,65535,13,0];
  const originalExpected=nativeMix(originalSeed,Uint16Array.from(originalUnits));
  const script='const createFusedArxKernel='+createFusedArxKernel.toString()+';\n'+
    'const bytes=Uint8Array.from('+JSON.stringify([...moduleBytes])+');\n'+
    'try{const kernel=createFusedArxKernel(bytes);'+
    'const result=kernel.mix('+JSON.stringify(originalSeed)+
      ',Uint16Array.from('+JSON.stringify(originalUnits)+'));'+
    'document.getElementById("out").textContent=JSON.stringify(result);'+
    '}catch(error){document.getElementById("out").textContent="error:"+String(error);}' ;
  const sourceServer=http.createServer((request,response)=>{
    if(request.url==='/app.mjs'){
      response.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'}).end(script);
      return;
    }
    if(request.url==='/origin.html'){
      response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(
        '<!doctype html><html><meta charset="utf-8"><body><pre id="out">pending</pre>'+
        '<script type="module" src="/app.mjs"></script></body></html>');
      return;
    }
    response.writeHead(404).end();
  });
  const attackerServer=http.createServer((request,response)=>{
    response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(
      '<!doctype html><html><meta charset="utf-8"><body>Independent attacker origin</body></html>');
  });
  /** @param {http.Server} server @returns {Promise<number>} */
  async function listen(server){
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    return address.port;
  }
  /** @param {http.Server} server @returns {Promise<void>} */
  async function close(server){
    if(!server.listening)return;
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try {
    const sourcePort=await listen(sourceServer);
    const attackerPort=await listen(attackerServer);
    assert.notEqual(sourcePort,attackerPort);
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']
    });
    const version=await browser.version();
    const original=await browser.newPage();
    await original.evaluateOnNewDocument(()=>{
      const target=globalThis.WebAssembly;
      /** @type {number[][]} */
      const records=[];
      /** @type {typeof globalThis & {__publicWasmCapture?:number[][]}} */(globalThis)
        .__publicWasmCapture=records;
      const Module=new Proxy(target.Module,{
        construct(ctor,args,newTarget){
          const input=args[0];
          const bytes=input instanceof ArrayBuffer?
            new Uint8Array(input):
            new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
          records.push(Array.from(bytes));
          return Reflect.construct(ctor,args,newTarget);
        }
      });
      globalThis.WebAssembly=new Proxy(target,{
        get(object,key){return key==='Module'?Module:Reflect.get(object,key,object);}
      });
    });
    await original.goto('http://127.0.0.1:'+sourcePort+'/origin.html',
      {waitUntil:'domcontentloaded',timeout:45000});
    await original.waitForFunction(()=>
      document.getElementById('out')?.textContent!=='pending',{timeout:30000});
    const output=await original.$eval('#out',element=>element.textContent??'');
    assert.equal(output,JSON.stringify(originalExpected));
    const captured=await original.evaluate(()=>
      (/** @type {typeof globalThis & {__publicWasmCapture?:number[][]}} */(globalThis))
        .__publicWasmCapture??[]);
    assert.equal(captured.length,1,'Document preload must intercept exactly one module');
    const publicBytes=Uint8Array.from(captured[0]);
    assert.equal(createHash('sha256').update(publicBytes).digest('hex'),digest);
    assert.deepEqual(Buffer.from(publicBytes),Buffer.from(moduleBytes));
    await original.close();
    await close(sourceServer);

    const attacker=await browser.newPage();
    await attacker.goto('http://127.0.0.1:'+attackerPort+'/attacker.html',
      {waitUntil:'domcontentloaded',timeout:45000});
    let value=0x31dff;
    const fixtures=[{seed:originalSeed,units:originalUnits}];
    for(let trial=0;trial<16;trial++){
      value=next(value);
      const count=trial===15?12288:trial*17;
      const seed=[value,next(value),next(next(value)),next(next(next(value)))];
      const units=Array.from({length:count},(_,index)=>(index*107+trial*271)&65535);
      fixtures.push({seed,units});
    }
    const predicted=fixtures.map(item=>nativeMix(item.seed,Uint16Array.from(item.units)));
    const observed=await attacker.evaluate((encoded,cases)=>{
      const bytes=Uint8Array.from(encoded);
      const buffer=new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      const instance=new WebAssembly.Instance(new WebAssembly.Module(buffer));
      const fn=/** @type {(a:number,b:number,c:number,d:number,p:number,n:number)=>void} */(
        /** @type {unknown} */(instance.exports.mix));
      const memory=/** @type {WebAssembly.Memory} */(
        /** @type {unknown} */(instance.exports.memory));
      let view=new DataView(memory.buffer);
      return cases.map(item=>{
        const needed=16+item.units.length*2;
        if(needed>memory.buffer.byteLength){
          memory.grow(Math.ceil((needed-memory.buffer.byteLength)/65536));
          view=new DataView(memory.buffer);
        }
        for(let i=0;i<item.units.length;i++)view.setUint16(16+i*2,item.units[i],true);
        fn(item.seed[0],item.seed[1],item.seed[2],item.seed[3],16,item.units.length);
        return [view.getInt32(0,true),view.getInt32(4,true),
          view.getInt32(8,true),view.getInt32(12,true)];
      });
    },[...publicBytes],fixtures);
    assert.deepEqual(observed,predicted);
    console.log('FUSED_ARX_BROWSER_RUNTIME_CLONE '+JSON.stringify({
      chromium:version,wasmSha256:digest,publicBytes:publicBytes.length,
      independentOrigin:sourcePort!==attackerPort,
      browserCloneInputs:fixtures.length,stateWordChecks:4*fixtures.length,
      sourceServerClosedBeforeClone:true,
      limitation:'fixed known-ABI standalone kernel, no 3-file app or minifier attacker comparison'
    }));
    await attacker.close();
  }finally{
    if(browser)await browser.close();
    await close(sourceServer);
    await close(attackerServer);
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
