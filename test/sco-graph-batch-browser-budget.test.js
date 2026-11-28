'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {pathToFileURL}=require('node:url');
const {transformSync}=require('esbuild');
const {partitionScoAsyncGraph,createScoGraphHandler}=require('../src');

const secretCode='export const seed=0x9e3779b9;';
const apiCode=[
  "import {seed} from './secret.mjs';",
  'export async function compute(text){',
  '  let state=seed;',
  '  for(let i=0;i<250000;i++){',
  '    state=(Math.imul(state^(text.charCodeAt(i%text.length)+i),1664525)+1013904223)|0;',
  '  }',
  '  return state>>>0;',
  '}'
].join('\n');

/** @returns {string} */
function chromeBinary(){
  if(process.env.CHROMIUM_BIN)return process.env.CHROMIUM_BIN;
  if(process.platform==='win32')return path.join(
    process.env.PROGRAMFILES??'C:\\Program Files',
    'Google','Chrome','Application','chrome.exe');
  return '/usr/bin/google-chrome';
}

/**
 * A conventional handwritten RPC batch transport compiled with esbuild.
 * Both clients intentionally call the same trusted server, using the same
 * method ID, private source, authorization and JSON response protocol.
 * @param {string} method
 * @param {string} batchMethod
 * @returns {string}
 */
function ordinarySource(method,batchMethod){
  const source='export async function batch(calls){'+
    'const wire=calls.map(item=>({method:'+JSON.stringify(method)+
    ',args:item.args}));'+
    'const response=await fetch("/obfs/rpc",{method:"POST",credentials:"same-origin",'+
    'cache:"no-store",headers:{"content-type":"application/json"},'+
    'body:JSON.stringify({method:'+JSON.stringify(batchMethod)+
    ',args:[wire]})});'+
    'const payload=await response.json();'+
    'if(!response.ok||payload.ok!==true)throw Error("Batch failed");'+
    'return payload.value;}';
  return transformSync(source,{format:'esm',target:'es2022',minify:true}).code;
}

/**
 * Run a genuinely hot browser workload without Chrome's virtual-time flag.
 * The browser's renderer TaskDuration CDP metric is independently sampled
 * around each lane, and the trusted Node server process CPU is measured
 * during each protected RPC response. Wall-clock samples come from real
 * Chromium performance.now(), not a simulated or virtual-time clock.
 *
 * Original source is temporarily available to the browser under /native
 * solely for a legitimate unprotected native comparison. This benchmark
 * cannot certify SCO source secrecy or anti-relay protection.
 */
test('real Chromium paired browser/server compute and hot wall-time for SCO graph batching',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-graph-browser-cdp-'));
  /** @type {http.Server|undefined} */
  let server;
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    await fs.writeFile(path.join(temp,'secret.mjs'),secretCode);
    await fs.writeFile(path.join(temp,'api.mjs'),apiCode);
    const original=await import(pathToFileURL(path.join(temp,'api.mjs')).href);
    const graph=partitionScoAsyncGraph([
      {path:'api.mjs',code:apiCode,sourceType:'module'},
      {path:'secret.mjs',code:secretCode,sourceType:'module'}
    ],{
      seed:'agent31-browser-cdp-paired-20261128',
      exposedPaths:['api.mjs'],batchPaths:['api.mjs'],maxBatchCalls:8
    });
    const partition=graph.partitions['api.mjs'];
    if(!partition.batchMethod)throw Error('Missing batch method');
    const minified=ordinarySource(partition.methodNames.compute,partition.batchMethod);
    const sourceFiles=new Map([['/native/api.mjs',apiCode],
      ['/native/secret.mjs',secretCode],
      ['/ordinary/api.mjs',minified]]);
    /** @type {string[][]} */
    const inputs=Array.from({length:6},(_,trial)=>
      Array.from({length:8},(_,index)=>
        'abcdef0123456789'+String(trial).padStart(2,'0')+String(index).padStart(2,'0')));
    /** @type {number[][]} */
    const expected=[];
    for(const values of inputs){
      const row=[];
      for(const value of values)row.push(await original.compute(value));
      expected.push(row);
    }
    const app=[
      "import {compute} from '/native/api.mjs';",
      "import {batch as generated} from '/obfs/api.mjs';",
      "import {batch as ordinary} from '/ordinary/api.mjs';",
      'const impl={native:async calls=>{',
      '  const output=[];',
      '  for(const call of calls)output.push({ok:true,value:await compute(...call.args)});',
      '  return output;',
      '},generated,ordinary};',
      'globalThis.__bench={cases:'+JSON.stringify(inputs)+
        ',expected:'+JSON.stringify(expected)+',impl};',
      'globalThis.__ready=true;'
    ].join('\n');
    const handler=createScoGraphHandler(graph,{'api.mjs':original},{
      authorizeRpc:()=>true,authorizeOperation:()=>true
    });
    /** @type {number[]} */
    const rpcCpuMs=[];
    server=http.createServer((request,response)=>{
      const url=request.url??'/';
      if(url.startsWith('/obfs/')){
        const before=process.cpuUsage();
        response.once('finish',()=>{
          const used=process.cpuUsage(before);
          rpcCpuMs.push((used.user+used.system)/1000);
        });
        handler(request,response);
        return;
      }
      response.setHeader('content-security-policy',
        "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'");
      response.setHeader('cache-control','no-store');
      if(url==='/'){
        response.writeHead(200,{'content-type':'text/html; charset=utf-8'})
          .end('<!doctype html><html><body><pre id="answer">ready</pre>'+
            '<script type="module" src="/app.mjs"></script></body></html>');
        return;
      }
      const code=url==='/app.mjs'?app:sourceFiles.get(url);
      if(code!==undefined)response.writeHead(200,
        {'content-type':'text/javascript; charset=utf-8'}).end(code);
      else response.writeHead(404).end();
    });
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing socket');
    browser=await puppeteer.launch({
      executablePath:chromeBinary(),headless:true,protocolTimeout:90000,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const page=await browser.newPage();
    const cdp=await page.createCDPSession();
    await cdp.send('Performance.enable');
    await page.goto('http://127.0.0.1:'+address.port+'/',{waitUntil:'networkidle0'});
    await page.waitForFunction('globalThis.__ready === true',{timeout:30000});

    /**
     * @param {'native'|'generated'|'ordinary'} name
     * @param {number} trial
     * @returns {Promise<number>}
     */
    async function callBrowser(name,trial){
      return page.evaluate(async args=>{
        const bench=/** @type {any} */ (globalThis).__bench;
        const calls=bench.cases[args.trial].map(
          /** @param {string} text */ text=>({name:'compute',args:[text]}));
        const expectedValues=bench.expected[args.trial].map(
          /** @param {number} value */ value=>({ok:true,value}));
        const start=performance.now();
        const actual=await bench.impl[args.name](calls);
        const wallMs=performance.now()-start;
        if(JSON.stringify(actual)!==JSON.stringify(expectedValues)){
          throw Error('Source parity failed: '+args.name+'/'+args.trial);
        }
        return wallMs;
      },{name,trial});
    }
    /** @param {Awaited<ReturnType<typeof cdp.send>>} packet @returns {number} */
    function taskDuration(packet){
      const item=/** @type {{metrics?:Array<{name:string,value:number}>}} */ (packet)
        .metrics?.find(metric=>metric.name==='TaskDuration');
      if(!item||!Number.isFinite(item.value))throw Error('Missing Chromium TaskDuration metric');
      return item.value*1000;
    }
    const arms=/** @type {const} */ (['native','generated','ordinary']);
    for(let trial=0;trial<2;trial++){
      for(const name of arms)await callBrowser(name,trial);
    }
    /** @type {Record<'native'|'generated'|'ordinary',number[]>} */
    const wallMs={native:[],generated:[],ordinary:[]};
    /** @type {Record<'native'|'generated'|'ordinary',number[]>} */
    const rendererTaskMs={native:[],generated:[],ordinary:[]};
    /** @type {Record<'native'|'generated'|'ordinary',number[]>} */
    const serverCpuMs={native:[],generated:[],ordinary:[]};
    /** @type {Record<'native'|'generated'|'ordinary',number[]>} */
    const combinedCpuMs={native:[],generated:[],ordinary:[]};
    for(let trial=0;trial<6;trial++){
      const order=trial%2===0?arms:[...arms].reverse();
      for(const name of order){
        const beforeTask=taskDuration(await cdp.send('Performance.getMetrics'));
        const rpcCount=rpcCpuMs.length;
        const elapsedWall=await callBrowser(name,trial);
        const afterTask=taskDuration(await cdp.send('Performance.getMetrics'));
        // Complete the handler's already-sent response finish event.
        await new Promise(resolve=>setImmediate(resolve));
        const rpc=rpcCpuMs.slice(rpcCount);
        assert.equal(rpc.length,name==='native'?0:1,
          'Expected exactly one RPC for each protected/ordinary batch');
        const rendererCpu=afterTask-beforeTask;
        const serverCpu=rpc.length?rpc[0]:0;
        assert.ok(Number.isFinite(elapsedWall)&&elapsedWall>0);
        assert.ok(Number.isFinite(rendererCpu)&&rendererCpu>0,
          'Chromium task metric must resolve nonzero original work');
        assert.ok(Number.isFinite(serverCpu)&&serverCpu>=0);
        wallMs[name].push(elapsedWall);
        rendererTaskMs[name].push(rendererCpu);
        serverCpuMs[name].push(serverCpu);
        combinedCpuMs[name].push(rendererCpu+serverCpu);
      }
    }
    /** @type {Array<{cpuOverNative:number,ordinaryCpuOverNative:number,
     *   cpuOverOrdinary:number,wallOverNative:number,ordinaryWallOverNative:number}>} */
    const ratios=combinedCpuMs.native.map((native,index)=>({
      cpuOverNative:combinedCpuMs.generated[index]/native,
      ordinaryCpuOverNative:combinedCpuMs.ordinary[index]/native,
      cpuOverOrdinary:combinedCpuMs.generated[index]/combinedCpuMs.ordinary[index],
      wallOverNative:wallMs.generated[index]/wallMs.native[index],
      ordinaryWallOverNative:wallMs.ordinary[index]/wallMs.native[index]
    }));
    assert.equal(ratios.length,6);
    console.log(JSON.stringify({
      experiment:'sco-graph-browser-and-node-cdp-compute',
      node:process.version,platform:process.platform,chrome:await browser.version(),
      trialCount:6,batchSize:8,roundsPerCall:250000,
      originalModules:2,privateModules:1,
      clock:'real Chromium performance.now plus renderer CDP TaskDuration; no virtual time',
      serverCpu:'Node process.cpuUsage during each HTTP RPC, not whole Chrome/Node workload CPU',
      boundary:'hot calls after ESM and two warmup rounds; loopback, trusted server in same process',
      minifierControl:'ordinary esbuild-minified transport, same server/secret/policy/method IDs',
      nativeControl:'browser-native original JS served under /native solely for reference',
      wallMs,rendererTaskMs,serverCpuMs,combinedCpuMs,ratios,
      strictGeneratedCpuBreaches:ratios.filter(r=>r.cpuOverNative>2.5).length,
      strictGeneratedWallBreaches:ratios.filter(r=>r.wallOverNative>2.5).length,
      strictOrdinaryCpuBreaches:ratios.filter(r=>r.ordinaryCpuOverNative>2.5).length,
      strictOrdinaryWallBreaches:ratios.filter(r=>r.ordinaryWallOverNative>2.5).length,
      scope:'bounded instrumentation; excludes browser-network stack CPU, cold load and external RTT',
      secrecyClaim:'none; this benchmark intentionally exposes native source as a control'
    }));
  }finally{
    if(browser)await browser.close();
    if(server)await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await fs.rm(temp,{recursive:true,force:true});
  }
});
