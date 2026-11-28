'use strict';

/**
 * Execute the exact source-only Webcrack output as a real browser ESM graph,
 * not via the Node ESM-to-CJS loader or only on the original obfuscator bytes.
 * This is a finite behavioral-clone probe, not original-source recovery.
 *
 * @file Browser source-only reconstruction falsifier for the frozen PR #384.
 */
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {webcrack}=require('webcrack');
const {prepare}=require('./polyvariant-app-four-way-control');

/** @param {string} value @returns {string} */
function sha256(value){return createHash('sha256').update(value).digest('hex');}

const inputs=Object.freeze({
  minified:'d783d9e978ecbc18af1fe41f44cb59801732ec72310e55934714d547eae77094',
  published:'907553405e14dd2cd1d2977b98de19bfc3412b2ed6ee811e8b66cf3541072c79'
});
const outputs=Object.freeze({
  minified:'eca85c19f4abe82fd4b903abccdca0f9dd5b95a5329c587e7c0fdd3fa2ee9013',
  published:'f613a3944b04c2126f0fd2972ff0a3fa2f99ed0b7e4fed16db929c354e33fbd3'
});

/** @returns {Promise<object>} */
async function runBrowserEvidence(){
  const {graphs,protectedFunctions}=await prepare();
  assert.equal(protectedFunctions,3,'Three protected public functions required');
  /** @type {Map<string,string>} */
  const assets=new Map();
  for(const file of graphs.native)assets.set('/native/'+file.path,file.code);
  /** @type {Record<string,{inputSha256:string,outputSha256:string,vmSandboxCallCount:number}>} */
  const provenance={};
  for(const variant of /** @type {const} */(['minified','published'])){
    const math=graphs[variant].find(file=>file.path==='math.mjs');
    assert.ok(math,'Missing math dependency: '+variant);
    assert.equal(sha256(math.code),inputs[variant],
      'Frozen source math hash drifted: '+variant);
    let vmSandboxCallCount=0;
    const code=(await webcrack(math.code,{
      deobfuscate:true,unminify:true,unpack:false,jsx:false,
      sandbox:async ()=>{
        vmSandboxCallCount++;
        throw new Error('No-VM-source-input control disallows runtime decoder evaluation');
      }
    })).code;
    assert.equal(vmSandboxCallCount,0,'Webcrack attempted VM evaluation of '+variant);
    assert.equal(sha256(code),outputs[variant],
      'Browser subject differs from the proven Node external-tool bytes');
    provenance[variant]={inputSha256:sha256(math.code),outputSha256:sha256(code),vmSandboxCallCount};
    for(const file of graphs[variant])
      assets.set('/recovered-'+variant+'/'+file.path,
        file.path==='math.mjs'?code:file.code);
  }
  const originalEntry=graphs.native.find(file=>file.path==='entry.mjs');
  assert.ok(originalEntry,'Missing native app entry');
  const dropped=originalEntry.code.replace('if(host)host.emit(item);',
    'if(host&&false)host.emit(item);');
  assert.notEqual(dropped,originalEntry.code,'Dropped-host control must change');
  for(const file of graphs.native)
    assets.set('/host-drop/'+file.path,file.path==='entry.mjs'?dropped:file.code);
  assets.set('/index.html','<!doctype html><html><head><meta charset="utf-8"></head><body>audit</body></html>');
  assert.equal(assets.size,13,'Must serve four disjoint 3-file ESM graphs');
  let moduleRequests=0;
  const server=http.createServer((request,response)=>{
    const target=request.url??'';
    const body=assets.get(target);
    if(request.method!=='GET'||body===undefined) {
      response.writeHead(404).end();return;
    }
    if(target.endsWith('.mjs'))moduleRequests++;
    response.writeHead(200,{
      'Content-Type':target.endsWith('.mjs')?
        'text/javascript; charset=utf-8':'text/html; charset=utf-8',
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff'
    });
    response.end(body);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(true));
    });
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const version=await browser.version();
    const page=await browser.newPage();
    await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded',timeout:60000});
    const result=await page.evaluate(async ()=>{
      /** @type {Record<string,(seed:number,records:{kind:string,payload:string}[],host:{emit:(value:unknown)=>void})=>string>} */
      const variants={};
      for(const name of ['native','recovered-minified','recovered-published','host-drop']) {
        const namespace=await import('/'+name+'/entry.mjs');
        if(typeof namespace.runScenario!=='function')throw Error('Missing ESM export '+name);
        variants[name]=namespace.runScenario;
      }
      /** @param {number} n */
      function events(n) {
        return Array.from({length:n},(_,index)=>({
          kind:['start','tick','pause','stop'][index%4],
          payload:'data-'+index+(index%11===0?'終':'')+(index%13===0?'🧪':'')
        }));
      }
      /** @param {typeof variants.native} fn @param {number} count */
      function run(fn,count) {
        /** @type {unknown[]} */
        const calls=[];
        const value=fn(-817,events(count),{emit(item){calls.push(item);}});
        return {value,callbacks:JSON.stringify(calls),count:calls.length};
      }
      /** @param {string} input @returns {Promise<string>} */
      async function hash(input) {
        const bytes=new TextEncoder().encode(input);
        const output=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
        return Array.from(output,value=>value.toString(16).padStart(2,'0')).join('');
      }
      const counts=[1,17,50,1000,10000];
      const rows=[];
      for(const count of counts) {
        const native=run(variants.native,count);
        if(native.count!==count)throw Error('Nonvacuous external host trace missing');
        for(const name of ['recovered-minified','recovered-published']){
          const candidate=run(variants[name],count);
          if(candidate.value!==native.value||
             candidate.callbacks!==native.callbacks||
             candidate.count!==native.count)
            throw Error('Webcrack browser ESM/host mismatch: '+name+' events '+count);
        }
        const noHost=run(variants['host-drop'],count);
        if(noHost.value!==native.value||noHost.count!==0||
           noHost.callbacks===native.callbacks)
          throw Error('Host-drop negative control was not detected at '+count);
        rows.push({
          events:count,
          outputSha256:await hash(native.value),
          callbackSha256:await hash(native.callbacks),
          actualHostCallbackCount:native.count,
          minifiedRecovered:true,publishedRecovered:true,
          hostDropMaintainsReturn:true,hostTraceDetectsDrop:true
        });
      }
      return {rows,graphVariants:Object.keys(variants)};
    });
    assert.deepEqual(result.rows.map(row=>row.events),[1,17,50,1000,10000]);
    assert.equal(moduleRequests,12,'All four 3-module graphs must be served from real HTTP');
    const evidence={
      scope:'Actual browser HTTP ESM direct Webcrack output, 2 recovered 3-module variants, five stateful workloads',
      frozenSource:'a8a22f9aef6e7f0d487cebc23c87063376df55cb',
      node:process.version,platform:process.platform,chromeVersion:version,
      browserOrigin:'http://127.0.0.1:<ephemeral-port>',
      webcrack:'2.16.0',provenance,servedEsmRequests:moduleRequests,
      rows:result.rows,
      originalSourceFormulasRecovered:'not measured',
      conclusion:'Two transformed public graph clones reproduce all tested outputs/host traces in real browser. No original formula recovery or incremental protection measured.'
    };
    if(process.env.OBFS_WEBCRACK_BROWSER_REPORT)
      await fs.writeFile(process.env.OBFS_WEBCRACK_BROWSER_REPORT,
        JSON.stringify(evidence,null,2)+'\n','utf8');
    return evidence;
  } finally {
    try {if(browser)await browser.close();}
    finally {
      await new Promise((resolve,reject)=>{
        server.close(error=>error?reject(error):resolve(true));
      });
    }
  }
}
if(require.main===module)runBrowserEvidence().then(evidence=>{
  process.stdout.write('WEBCRACK_NATIVE_ESM_CHROMIUM '+JSON.stringify(evidence)+'\n');
}).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={runBrowserEvidence};
