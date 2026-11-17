'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const puppeteer=require('puppeteer-core');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {prepare}=require('../sims/polyvariant-app-three-way-budget');
const {pairedBudgetBound}=require('../sims/paired-budget-bound');
const {familywiseBudgetBounds}=require('../sims/familywise-budget-bound');

/** @typedef {'native'|'published'|'reconstructed'} Variant */
/** @typedef {{totalMs:number,importMs:number,runMs:number}} Timings */
/** @typedef {{events:number,outputSha256:string,hostTraceSha256:string,emissions:number,measurements:Record<Variant,Timings[]>}} BrowserRow */

const variants=/** @type {const} */ (['native','published','reconstructed']);
const workloads=[1,50,1000,10000];
const trials=9;

/** @param {string} value @returns {string} */
function sha256(value){return createHash('sha256').update(value).digest('hex');}

/** @param {number} count @returns {{kind:string,payload:string}[]} */
function records(count){
  return Array.from({length:count},(_,index)=>({
    kind:['start','tick','pause','stop'][index%4],
    payload:'data-'+index+(index%11===0?'終':'')+(index%13===0?'🧪':'')
  }));
}

/**
 * @param {{runScenario:(seed:number,records:{kind:string,payload:string}[],host:{emit:(value:unknown)=>void})=>string}} app
 * @param {number} count
 * @returns {{events:number,outputSha256:string,hostTraceSha256:string,emissions:number}}
 */
function observeNode(app,count){
  const emitted=/** @type {unknown[]} */([]);
  const output=app.runScenario(-817,records(count),{emit(value){emitted.push(value);}});
  return {events:count,outputSha256:sha256(output),
    hostTraceSha256:sha256(JSON.stringify(emitted)),emissions:emitted.length};
}

/**
 * Counterbalance variant rank exactly within every three-trial cycle.
 * Adjacent cycles reverse their execution direction, so the first six
 * trials contain each of the three factorial orders exactly once.
 * @returns {Variant[][]}
 */
function trialOrders(){
  /** @type {Variant[][]} */
  const result=[];
  for(let trial=0;trial<trials;trial++){
    const shift=trial%variants.length;
    const order=variants.map((_,rank)=>variants[(rank+shift)%variants.length]);
    if(Math.floor(trial/variants.length)%2===1)order.reverse();
    result.push([...order]);
  }
  return result;
}

/**
 * Build a browser page that imports a *new complete URL graph* per trial.
 * This includes actual localhost HTTP fetch, browser parse, link/evaluation,
 * synchronous business work, and host callbacks in the measured interval.
 * The page's own startup is excluded. Each trial's input is prepared before
 * timing, and the source build plus source-only attack are performed offline.
 * @returns {string}
 */
function page(){
  return `<!doctype html><html><meta charset="utf-8"><body><pre id="out">pending</pre>
<script type="module">
const variants=${JSON.stringify(variants)};
const workloads=${JSON.stringify(workloads)};
const trials=${trials};
const orders=${JSON.stringify(trialOrders())};
function records(count){
  return Array.from({length:count},(_,index)=>({
    kind:['start','tick','pause','stop'][index%4],
    payload:'data-'+index+(index%11===0?'終':'')+(index%13===0?'🧪':'')
  }));
}
async function sha(text){
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
async function run(variant,count,trial,input){
  const start=performance.now();
  const graph=await import('/graphs/'+variant+'/'+count+'/'+trial+'/entry.mjs');
  const loaded=performance.now();
  const emitted=[];
  const output=graph.runScenario(-817,input,{emit(value){emitted.push(value);}});
  const done=performance.now();
  if(emitted.length!==input.length)throw Error('Host callback count changed');
  const times={totalMs:done-start,importMs:loaded-start,runMs:done-loaded};
  if(!(times.totalMs>0&&times.importMs>0&&times.runMs>=0))
    throw Error('Invalid cold browser timings');
  return {output,trace:JSON.stringify(emitted),emissions:emitted.length,times,graph};
}
async function main(){
  const rows=[];
  const hotGraph={};
  for(const count of workloads){
    const input=records(count);
    const measurements={native:[],published:[],reconstructed:[]};
    let reference;
    for(let trial=0;trial<trials;trial++){
      for(const variant of orders[trial]){
        const observed=await run(variant,count,trial,input);
        if(count===10000&&trial===0)hotGraph[variant]=observed.graph;
        if(reference===undefined)reference=observed;
        else if(observed.output!==reference.output||observed.trace!==reference.trace||
          observed.emissions!==reference.emissions)
          throw Error('Full application output or host trace mismatch: '+variant+'/'+count+'/'+trial);
        measurements[variant].push(observed.times);
      }
    }
    rows.push({events:count,outputSha256:await sha(reference.output),
      hostTraceSha256:await sha(reference.trace),emissions:reference.emissions,measurements});
  }
  // Every warm CPU trial uses a previously imported graph and the same
  // complete Unicode-state workload, including host callbacks.
  const hotInput=records(10000);
  const targetTrace=[];
  const targetOutput=hotGraph.native.runScenario(-817,hotInput,{
    emit(value){targetTrace.push(value);}
  });
  const targetTraceText=JSON.stringify(targetTrace);
  function hotRun(variant){
    const emitted=[];
    const started=performance.now();
    const output=hotGraph[variant].runScenario(-817,hotInput,{
      emit(value){emitted.push(value);}
    });
    const elapsed=performance.now()-started;
    if(output!==targetOutput||JSON.stringify(emitted)!==targetTraceText)
      throw Error('Warm application output or host trace mismatch: '+variant);
    return elapsed;
  }
  for(let warm=0;warm<3;warm++)
    for(const variant of variants)hotRun(variant);
  const hotCpu={native:[],published:[],reconstructed:[]};
  for(let trial=0;trial<trials;trial++)
    for(const variant of orders[trial])hotCpu[variant].push(hotRun(variant));
  const probeStart=performance.now();
  let clockChecksum=0;
  for(let index=0;index<5000000;index++)
    clockChecksum=(clockChecksum+Math.imul(index,33))|0;
  const clockProbeMs=performance.now()-probeStart;
  if(clockProbeMs<0.1)throw Error('Browser clock does not advance during synchronous CPU work');
  document.getElementById('out').textContent='pass:'+JSON.stringify({
    rows,hotCpu,clockProbeMs,clockChecksum
  });
}
await main().catch(error=>{document.getElementById('out').textContent='fail:'+error.stack;});
</script></body></html>`;
}

/**
 * Full browser cold graph loading is a distinct cost boundary from the
 * previously measured already-imported synchronous application profile.
 * The localhost network is deliberately included; real WAN is unmeasured.
 * @returns {Promise<void>}
 */
async function main(){
  const prepared=await prepare();
  const {originalSha256,publishedSha256,reconstructedSha256}=prepared;
  const original=await import(pathToFileURL(
    path.join(__dirname,'../examples/polyvariant-app/native/entry.mjs')).href);
  const expected=workloads.map(count=>observeNode(original,count));
  assert.notEqual(originalSha256,publishedSha256);
  assert.notEqual(publishedSha256,reconstructedSha256);
  /** @type {Map<string,string>} */
  const assets=new Map([['/index.html',page()]]);
  for(const count of workloads){
    for(let trial=0;trial<trials;trial++){
      for(const variant of variants){
        for(const file of prepared.variants[variant]){
          const url='/graphs/'+variant+'/'+count+'/'+trial+'/'+file.path;
          assert.equal(assets.has(url),false,'Graph URL unexpectedly reused');
          assets.set(url,file.code);
        }
      }
    }
  }
  assert.equal(assets.size,1+workloads.length*trials*variants.length*3);
  /** @type {Map<string,number>} */
  const served=new Map();
  const server=http.createServer((request,response)=>{
    const key=request.url??'';
    if(request.method!=='GET'||!assets.has(key)){
      response.writeHead(404).end();
      return;
    }
    served.set(key,(served.get(key)??0)+1);
    response.writeHead(200,{
      'content-type':key.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(assets.get(key));
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browserSession;
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(true));
    });
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const root='http://127.0.0.1:'+address.port;
    browserSession=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const chromeVersion=await browserSession.version();
    const chromePage=await browserSession.newPage();
    await chromePage.goto(root+'/index.html',{
      waitUntil:'domcontentloaded',timeout:45000
    });
    await chromePage.waitForFunction(()=>{
      const text=document.getElementById('out')?.textContent??'';
      return text.startsWith('pass:')||text.startsWith('fail:');
    },{timeout:45000,polling:50});
    const outputText=await chromePage.$eval('#out',element=>element.textContent??'');
    assert.ok(outputText.startsWith('pass:'),
      'Chromium experiment rejected its own semantic/clock checks: '+outputText.slice(0,2500));
    const data=outputText.slice(5);
    const browser=/** @type {{rows:BrowserRow[],hotCpu:Record<Variant,number[]>,clockProbeMs:number,clockChecksum:number}} */
      (JSON.parse(data));
    assert.ok(Number.isFinite(browser.clockProbeMs)&&browser.clockProbeMs>=0.1,
      'Chromium monotonic clock did not advance with CPU work');
    assert.deepEqual(browser.rows.map(row=>row.events),workloads);
    for(const variant of variants){
      assert.equal(browser.hotCpu[variant].length,trials);
      assert.ok(browser.hotCpu[variant].every(ms=>Number.isFinite(ms)&&ms>0),
        'Browser warm 10000-event CPU clock did not advance: '+variant);
    }
    assert.deepEqual(browser.rows.map(({events,outputSha256,hostTraceSha256,emissions})=>({
      events,outputSha256,hostTraceSha256,emissions
    })),expected,'Chromium and native Node outputs or callback traces differ');
    const results=[];
    for(const row of browser.rows){
      for(const variant of variants){
        const measured=row.measurements[variant];
        assert.equal(measured.length,trials);
        for(const times of measured){
          assert.ok(Number.isFinite(times.totalMs)&&times.totalMs>0);
          assert.ok(Number.isFinite(times.importMs)&&times.importMs>0);
          assert.ok(Number.isFinite(times.runMs)&&times.runMs>=0);
          assert.ok(Math.abs(times.importMs+times.runMs-times.totalMs)<1e-6);
        }
      }
      assert.equal(row.emissions,row.events);
      if(row.events===10000){
        assert.ok(row.measurements.native.some(x=>x.runMs>0),
          'Chromium failed to measure actual 10000-event synchronous application CPU');
      }
      results.push({events:row.events,outputSha256:row.outputSha256,
        hostTraceSha256:row.hostTraceSha256,emissions:row.emissions,
        publishedVsNative:pairedBudgetBound(
          row.measurements.native.map(x=>x.totalMs),
          row.measurements.published.map(x=>x.totalMs)),
        reconstructedVsNative:pairedBudgetBound(
          row.measurements.native.map(x=>x.totalMs),
          row.measurements.reconstructed.map(x=>x.totalMs)),
        rawTimings:row.measurements});
    }
    for(const [name,files] of Object.entries(prepared.variants)){
      for(const file of files){
        for(const count of workloads){
          for(let trial=0;trial<trials;trial++){
            assert.equal(served.get('/graphs/'+name+'/'+count+'/'+trial+'/'+file.path),1,
              'Each fresh ESM asset must be served exactly once');
          }
        }
      }
    }
    const publishedFamilywise=familywiseBudgetBounds(browser.rows.map(row=>({
      native:row.measurements.native.map(x=>x.totalMs),
      candidate:row.measurements.published.map(x=>x.totalMs)
    })));
    const reconstructedFamilywise=familywiseBudgetBounds(browser.rows.map(row=>({
      native:row.measurements.native.map(x=>x.totalMs),
      candidate:row.measurements.reconstructed.map(x=>x.totalMs)
    })));
    process.stdout.write('POLYVARIANT_COLD_CHROMIUM '+JSON.stringify({
      node:process.version,platform:process.platform,
      chromiumBin:process.env.CHROMIUM_BIN??'google-chrome',chromeVersion,
      sourceHashes:{native:originalSha256,published:publishedSha256,
        reconstructed:reconstructedSha256},
      boundary:'same Chromium page, unique non-cached three-module URLs for each session; localhost HTTP fetch + ESM link/evaluate + full synchronous application and host callbacks; browser process/page startup, source build and source-only reconstruction excluded',
      trials,clockProbeMs:browser.clockProbeMs,clockChecksum:browser.clockChecksum,
      loadsPerVariant:trials*workloads.length,
      verifiedGraphRequests:workloads.length*trials*variants.length*3,
      publishedFamilywise,reconstructedFamilywise,
      warmTenThousand:{events:10000,trials,warmedIterations:3,
        boundary:'previously imported ESM graph, three warmups, full 10000-event application and external host callbacks; no HTTP or import within timed calls',
        publishedVsNative:pairedBudgetBound(browser.hotCpu.native,browser.hotCpu.published),
        reconstructedVsNative:pairedBudgetBound(browser.hotCpu.native,browser.hotCpu.reconstructed),
        rawTimings:browser.hotCpu},rows:results
    })+'\n');
  }finally{
    if(browserSession)await browserSession.close();
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(true)));
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main,page,trialOrders};
