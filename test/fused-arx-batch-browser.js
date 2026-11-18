'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const puppeteer=require('puppeteer-core');
const {buildArxModuleBytes,nativeMix,createFusedArxKernel}=
  require('../sims/fused-arx-batch');

/**
 * Browser research pilot for warmed whole-buffer Wasm calls. It compares the
 * exact same Uint16Array inputs, state and return values in Chromium. No
 * browser startup or fresh-page compilation time is deducted or inferred.
 * @returns {Promise<void>}
 */
async function main() {
  const bytes=buildArxModuleBytes();
  const html=[
    '<!doctype html><html><meta charset="utf-8"><body><pre id="output">pending</pre>',
    '<script>',
    'const nativeMix='+nativeMix.toString()+';',
    'const createFusedArxKernel='+createFusedArxKernel.toString()+';',
    'const bytes=Uint8Array.from('+JSON.stringify([...bytes])+');',
    'try {',
    'const initAt=performance.now();',
    'const kernel=createFusedArxKernel(bytes);',
    'const initialSetupMs=performance.now()-initAt;',
    'const seed=[1,2,3,4];',
    'const rows=[];',
    'for(const length of [16,128,2048]){',
    '  const units=Uint16Array.from({length},(_,index)=>index*101);',
    '  const reference=nativeMix(seed,units);',
    '  const candidate=kernel.mix(seed,units);',
    "  if(JSON.stringify(reference)!==JSON.stringify(candidate))throw Error('state mismatch');",
    '  function work(fn){',
    '    let check=0;',
    '    const start=performance.now();',
    '    for(let index=0;index<2500;index++)check^=fn(seed,units)[0];',
    '    const ms=performance.now()-start;',
    "    if(check!==0||ms<=0)throw Error('invalid timed comparison');",
    '    return ms;',
    '  }',
    '  for(let warmup=0;warmup<3;warmup++){work(nativeMix);work(kernel.mix);}',
    '  const samples={native:[],wasm:[]};',
    '  for(let trial=0;trial<12;trial++){',
    "    const order=trial%2===0?['native','wasm']:['wasm','native'];",
    '    for(const arm of order){',
    "      const ms=work(arm==='native'?nativeMix:kernel.mix);",
    '      samples[arm].push(ms);',
    '    }',
    '  }',
    '  const ratios=samples.wasm.map((ms,index)=>ms/samples.native[index]);',
    '  const sorted=[...ratios].sort((a,b)=>a-b);',
    '  rows.push({units:length,samples,medianPairedRatio:sorted[6],',
    '    observedStrictBreaches:ratios.filter(value=>value>2.5).length});',
    '}',
    'document.querySelector("#output").textContent="pass:"+JSON.stringify({',
    '  initialSetupMs,rows,clock:"real Chromium performance.now",',
    '  expected:'+"JSON.stringify(nativeMix(seed,Uint16Array.from([0,65,65535,55296]))),",
    '});',
    '}catch(error){',
    'document.querySelector("#output").textContent="fail:"+String(error.stack||error);',
    '}',
    '</script></body></html>'
  ].join('\n');
  const server=http.createServer((request,response)=>{
    if(request.url!=='/index.html'){
      response.writeHead(404).end();return;
    }
    response.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'no-store'});
    response.end(html);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try {
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
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']
    });
    const version=await browser.version();
    const tab=await browser.newPage();
    await tab.goto('http://127.0.0.1:'+address.port+'/index.html',
      {waitUntil:'domcontentloaded',timeout:45000});
    await tab.waitForFunction(()=>{
      const value=document.querySelector('#output')?.textContent??'';
      return value.startsWith('pass:')||value.startsWith('fail:');
    },{timeout:90000,polling:40});
    const rendered=await tab.$eval('#output',element=>element.textContent??'');
    assert.ok(rendered.startsWith('pass:'),
      'ARX Chromium pilot failed: '+rendered.slice(0,1500));
    const output=/** @type {{initialSetupMs:number,rows:{units:number,samples:{native:number[],wasm:number[]},medianPairedRatio:number,observedStrictBreaches:number}[],expected:string,clock:string}} */(
      JSON.parse(rendered.slice(5)));
    assert.equal(output.rows.length,3);
    for(const row of output.rows){
      assert.equal(row.samples.native.length,12);
      assert.equal(row.samples.wasm.length,12);
      assert.ok([...row.samples.native,...row.samples.wasm].every(ms=>
        Number.isFinite(ms)&&ms>0));
    }
    console.log('FUSED_ARX_CHROMIUM '+JSON.stringify({
      chromeVersion:version,sha256:createHash('sha256').update(bytes).digest('hex'),
      node:process.version,v8:process.versions.v8,output,
      limitation:'warm kernel calls only; independent artifact attestation and cold app parity pending'
    }));
  }finally{
    if(browser)await browser.close();
    /** @type {Promise<void>} */
    const closing=new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await closing;
  }
}
if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
