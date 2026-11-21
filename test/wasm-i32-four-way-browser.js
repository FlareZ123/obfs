'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const puppeteer=require('puppeteer-core');
const {prepare}=require('../sims/wasm-i32-four-way-minified');
const {pairedBudgetBound}=require('../sims/paired-budget-bound');

/** @typedef {'native'|'minified'|'wasm'|'reconstructed'} Variant */
/** @typedef {{path:string,code:string}[]} Graph */

/**
 * Independently serve the four compiler-generated ESM graphs under distinct
 * browser paths. No JS code is substituted after it reaches the browser.
 * @returns {Promise<void>}
 */
async function main(){
  const {graphs,recoveredFunctions}=await prepare();
  assert.equal(recoveredFunctions,2);
  /** @type {Record<Variant,string>} */
  const graphHashes={native:'',minified:'',wasm:'',reconstructed:''};
  for(const name of /** @type {Variant[]} */(
    ['native','minified','wasm','reconstructed'])){
    const hash=createHash('sha256');
    for(const file of graphs[name])hash.update(file.path+'\0'+file.code+'\0');
    graphHashes[name]=hash.digest('hex');
  }
  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    if(request.url==='/index.html'){
      response.writeHead(200,{
        'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'no-store',
        'Content-Security-Policy':"script-src 'self' 'wasm-unsafe-eval'"
      });
      response.end('<!doctype html><html><head><meta charset="utf-8"></head><body>Four-way ESM test</body></html>');
      return;
    }
    const hit=/^\/(native|minified|wasm|reconstructed)\/10000\/(\d+)\/(kernel|bridge|entry)\.mjs$/u.exec(request.url??'');
    if(!hit||Number(hit[2])>=12){
      response.writeHead(404).end();
      return;
    }
    const group=/** @type {Variant} */(hit[1]);
    const file=graphs[group].find(item=>item.path===hit[3]+'.mjs');
    if(!file){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'Content-Type':'text/javascript; charset=utf-8',
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff'
    });
    response.end(file.code);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    /** @type {Promise<void>} */
    const ready=new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve());
    });
    await ready;
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const version=await browser.version();
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:'+address.port+'/index.html',{
      waitUntil:'domcontentloaded',timeout:45000
    });
    const measured=await page.evaluate(async()=>{
      const variants=/** @type {('native'|'minified'|'wasm'|'reconstructed')[]} */(
        ['native','minified','wasm','reconstructed']);
      const orders=[
        ['native','minified','wasm','reconstructed'],
        ['reconstructed','wasm','minified','native'],
        ['minified','native','reconstructed','wasm'],
        ['wasm','reconstructed','native','minified']
      ];
      /** @type {Record<'native'|'minified'|'wasm'|'reconstructed',number[]>} */
      const work={native:[],minified:[],wasm:[],reconstructed:[]};
      /** @type {Record<'native'|'minified'|'wasm'|'reconstructed',number[]>} */
      const firstUse={native:[],minified:[],wasm:[],reconstructed:[]};
      /** @type {Record<'native'|'minified'|'wasm'|'reconstructed',number[]>} */
      const importLatency={native:[],minified:[],wasm:[],reconstructed:[]};
      let clockSum=0;
      const beforeClock=performance.now();
      for(let i=0;i<2000000;i++)clockSum=(clockSum+(i^0x9e37))|0;
      const clockProbeMs=performance.now()-beforeClock;
      if(clockProbeMs<0.1)throw Error('No real browser clock witness');
      const records=Array.from({length:10000},(_,i)=>({
        a:i<8?[-2147483648,-1,0,1,31,32,2147483647,0x12345678][i]:
          Math.imul(i^0x9bf34621,0x9e3779b1)|0,
        b:Math.imul(i+71,1664525)|0,
        c:Math.imul(i+149,1013904223)|0,
        d:(i>>>3)&31,
        label:'event-'+i+(i%47===0?'終':'')
      }));
      let comparisons=0;
      for(let trial=0;trial<12;trial++){
        /** @type {string|undefined} */
        let reference;
        for(const variant of orders[trial%orders.length]){
          const start=performance.now();
          const app=/** @type {{run:(a:number,b:number,c:number,d:number,label:string)=>string}} */(
            await import('/'+variant+'/10000/'+trial+'/entry.mjs'));
          const imported=performance.now();
          /** @type {{value:number,label:string}[]} */
          const callback=[];
          (/** @type {any} */(globalThis)).externalBridge={
            /** @param {number} value @param {string} label */
            deliver(value,label){
              callback.push({value,label});
              return label+':'+(value>>>0).toString(16);
            }
          };
          const first=records[0];
          const beforeFirst=performance.now();
          app.run(first.a,first.b,first.c,first.d,first.label);
          const afterFirst=performance.now();
          for(let index=0;index<1024;index++){
            const row=records[index%records.length];
            app.run(row.a,row.b,row.c,row.d,row.label);
          }
          callback.length=0;
          /** @type {string[]} */
          const outputs=[];
          const beforeWork=performance.now();
          for(const row of records)
            outputs.push(app.run(row.a,row.b,row.c,row.d,row.label));
          const afterWork=performance.now();
          if(callback.length!==records.length)throw Error('Browser host callback mismatch');
          const observed=JSON.stringify([outputs,callback]);
          if(reference!==undefined && observed!==reference)
            throw Error('Four-way Chromium output or host callback mismatch '+variant+'/'+trial);
          if(reference===undefined)reference=observed;
          importLatency[/** @type {'native'|'minified'|'wasm'|'reconstructed'} */(variant)]
            .push(imported-start);
          firstUse[/** @type {'native'|'minified'|'wasm'|'reconstructed'} */(variant)]
            .push(afterFirst-beforeFirst);
          work[/** @type {'native'|'minified'|'wasm'|'reconstructed'} */(variant)]
            .push(afterWork-beforeWork);
          comparisons+=records.length;
        }
      }
      return {clockProbeMs,clockSum,trialPairs:12,eventsPerTrial:10000,
        comparedVariantCalls:comparisons,fullOutputAndCallbackParity:true,
        timings:{importLatency,firstUse,work}};
    });
    assert.equal(measured.trialPairs,12);
    assert.equal(measured.eventsPerTrial,10000);
    assert.equal(measured.comparedVariantCalls,480000);
    assert.equal(measured.fullOutputAndCallbackParity,true);
    assert.ok(measured.clockProbeMs>=0.1);
    const w=measured.timings.work;
    for(const name of /** @type {Variant[]} */(
      ['native','minified','wasm','reconstructed'])){
      assert.equal(w[name].length,12);
      assert.ok(w[name].every(value=>Number.isFinite(value)&&value>0));
    }
    const vsNative=pairedBudgetBound(w.native,w.wasm);
    const vsMinified=pairedBudgetBound(w.minified,w.wasm);
    const report={
      browser:'Chromium',version,platform:process.platform,
      hashes:graphHashes,sourceRecoveredFunctions:recoveredFunctions,
      clockProbeMs:measured.clockProbeMs,
      pairedWorkload:'12 counterbalanced trials; 10000 typed Int32 events and host callbacks each',
      matchedFullOutputAndCallbackParity:true,
      computeBoundary:'synchronous application work after import and 1024-call warmup',
      nonComputeLatency:'module HTTP imports recorded separately; first-use compilation recorded separately',
      wasmVsNative:vsNative,wasmVsMinified:vsMinified,
      strictObservedBreaches:{
        native:vsNative.samplePairs-vsNative.observedPairsWithinBudget,
        minified:vsMinified.samplePairs-vsMinified.observedPairsWithinBudget
      },
      timingMs:measured.timings,
      caveat:'Browser samples are a fixed local workload. They cannot establish a universal 2.5x bound or resist source-only Wasm reconstruction.'
    };
    console.log('WASM_I32_FOUR_WAY_CHROMIUM '+JSON.stringify(report));
  }finally{
    try{if(browser)await browser.close();}
    finally{
      /** @type {Promise<void>} */
      const closed=new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve()));
      await closed;
    }
  }
}
if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
