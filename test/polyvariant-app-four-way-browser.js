'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {prepare}=require('../sims/polyvariant-app-four-way-control');
const {pairedBudgetBound}=require('../sims/paired-budget-bound');
const {atomicWrite}=require('../src/atomic');

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
 * @param {{runScenario:(seed:number,records:{kind:string,payload:string}[],host:{emit:(item:unknown)=>void})=>string}} api
 * @param {number} count
 */
function observeNode(api,count){
  /** @type {unknown[]} */
  const observed=[];
  const output=api.runScenario(-817,records(count),{emit(item){observed.push(item);}});
  return {events:count,outputSha256:sha256(output),
    callbackSha256:sha256(JSON.stringify(observed)),emitted:observed.length};
}

/** @returns {string} */
function page(){
  return `<!doctype html><html><meta charset="utf-8"><body>
<pre id="out">pending</pre>
<script type="module">
import {runScenario as native} from "/native/entry.mjs";
import {runScenario as minified} from "/minified/entry.mjs";
import {runScenario as published} from "/published/entry.mjs";
import {runScenario as reconstructed} from "/reconstructed/entry.mjs";
const implementations={native,minified,published,reconstructed};
function records(count){
  return Array.from({length:count},(_,index)=>({
    kind:["start","tick","pause","stop"][index%4],
    payload:"data-"+index+(index%11===0?"終":"")+(index%13===0?"🧪":"")
  }));
}
function observe(fn,input){
  const callbacks=[];
  const output=fn(-817,input,{emit(item){callbacks.push(item);}});
  return {output,callbacks:JSON.stringify(callbacks),emitted:callbacks.length};
}
async function sha256(value){
  const data=new TextEncoder().encode(value);
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",data));
  return Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("");
}
const rows=[];
for(const count of [1,50,1000,10000]){
  const input=records(count),expected=observe(native,input);
  for(const [name,fn] of Object.entries(implementations)){
    const actual=observe(fn,input);
    if(actual.output!==expected.output||actual.callbacks!==expected.callbacks||
       actual.emitted!==expected.emitted){
      document.getElementById("out").textContent="mismatch:"+name+":"+count;
      throw Error("Four-way state or external callback mismatch");
    }
  }
  rows.push({events:count,outputSha256:await sha256(expected.output),
    callbackSha256:await sha256(expected.callbacks),emitted:expected.emitted});
}
const hot=records(10000);
function time(fn){
  let emitted=0;
  const start=performance.now();
  fn(-817,hot,{emit(){emitted++;}});
  const elapsed=performance.now()-start;
  if(emitted!==hot.length||elapsed<=0)throw Error("Invalid hot timing");
  return elapsed;
}
for(let warm=0;warm<4;warm++)
  for(const fn of Object.values(implementations))time(fn);
const samples={native:[],minified:[],published:[],reconstructed:[]};
const orders=[
  ["native","minified","published","reconstructed"],
  ["reconstructed","published","minified","native"],
  ["minified","native","reconstructed","published"],
  ["published","reconstructed","native","minified"]
];
for(let trial=0;trial<9;trial++)
  for(const name of orders[trial%orders.length])
    samples[name].push(time(implementations[name]));
// Distinct URL prefixes force fresh ESM graph fetch, parse, link, evaluate,
// and first invocation for each measurement, including all dependencies.
const cold={};
for(const count of [1,10000]){
  const input=records(count);
  const timings={native:[],minified:[],published:[],reconstructed:[]};
  for(let trial=0;trial<9;trial++){
    for(const name of orders[trial%orders.length]){
      const start=performance.now();
      const api=await import('/cold-'+name+'-'+count+'-'+trial+'/entry.mjs');
      let emitted=0;
      api.runScenario(-817,input,{emit(){emitted++;}});
      const elapsed=performance.now()-start;
      if(emitted!==count||elapsed<=0)throw Error("Invalid cold graph: "+name+":"+count);
      timings[name].push(elapsed);
    }
  }
  cold[count]=timings;
}
document.getElementById("out").textContent="pass:"+JSON.stringify({rows,samples,cold});
</script></body></html>`;
}

/** @returns {Promise<void>} */
async function main(){
  const {graphs,minifiedAttack,publishedAttack}=await prepare();
  assert.equal(minifiedAttack.recovered,3);
  assert.equal(publishedAttack.functions.length,3);
  const assets=new Map();
  for(const [variant,files] of Object.entries(graphs))
    for(const file of files)assets.set('/'+variant+'/'+file.path,file.code);
  assert.equal(assets.size,12);
  assets.set('/index.html',page());
  let coldModuleRequests=0;

  const native=await import(pathToFileURL(
    path.join(__dirname,'../examples/polyvariant-app/native/entry.mjs')).href);
  const expected=[1,50,1000,10000].map(count=>observeNode(native,count));
  const server=http.createServer((request,response)=>{
    const target=request.url??'';
    const cold=/^\/cold-(native|minified|published|reconstructed)-(1|10000)-([0-8])\/(math|state|entry)\.mjs$/u.exec(target);
    const source=cold?assets.get('/'+cold[1]+'/'+cold[4]+'.mjs'):assets.get(target);
    if(request.method!=='GET'||source===undefined){
      response.writeHead(404).end();
      return;
    }
    if(cold)coldModuleRequests++;
    response.writeHead(200,{
      'content-type':target.endsWith('.html')?
        'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(source);
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(true));
    });
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const root='http://127.0.0.1:'+address.port;
    for(const variant of ['minified','published']){
      const response=await fetch(root+'/'+variant+'/math.mjs');
      assert.equal(response.status,200);
      assert.equal(await response.text(),graphs[variant].find(file=>file.path==='math.mjs')?.code);
    }
    const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'google-chrome',[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=30000','--dump-dom',root+'/index.html'
    ],{timeout:60000,maxBuffer:8*1024*1024,encoding:'utf8'});
    const text=stdout.match(/<pre id="out">pass:(\{[^<]*\})<\/pre>/u)?.[1];
    assert.ok(text,'Browser did not complete four-way ESM application: '+stdout.slice(-1800));
    const actual=JSON.parse(text);
    assert.deepEqual(actual.rows,expected);
    for(const name of ['native','minified','published','reconstructed']){
      const samples=actual.samples[name];
      assert.equal(samples.length,9);
      assert.ok(samples.every(value=>Number.isFinite(value)&&value>0));
      for(const count of ['1','10000']){
        const cold=actual.cold[count][name];
        assert.equal(cold.length,9);
        assert.ok(cold.every(value=>Number.isFinite(value)&&value>0));
      }
    }
    // Two workloads x 9 trials x 4 variants x 3 distinct ESM module URLs.
    assert.equal(coldModuleRequests,216,'All cold ESM graph dependencies must be fetched');
    const coldFreshGraphs=Object.fromEntries(['1','10000'].map(count=>[
      count,{
        events:Number(count),trialsPerVariant:9,
        nativeToMinified:pairedBudgetBound(actual.cold[count].native,actual.cold[count].minified),
        nativeToPublished:pairedBudgetBound(actual.cold[count].native,actual.cold[count].published),
        minifiedToPublished:pairedBudgetBound(actual.cold[count].minified,actual.cold[count].published),
        nativeToReconstructed:pairedBudgetBound(actual.cold[count].native,actual.cold[count].reconstructed),
        samples:actual.cold[count]
      }
    ]));
    const browserEvidence={
      node:process.version,platform:process.platform,
      matchedWorkloads:actual.rows.length,verifiedFullOutputs:true,
      verifiedExternalCallbacks:true,pairedHotWorkEvents:10000,
      freshGraphHttpModuleRequests:coldModuleRequests,coldFreshGraphs,
      minifiedVsNative:pairedBudgetBound(actual.samples.native,actual.samples.minified),
      publishedVsNative:pairedBudgetBound(actual.samples.native,actual.samples.published),
      publishedVsMinified:pairedBudgetBound(actual.samples.minified,actual.samples.published),
      reconstructedVsNative:pairedBudgetBound(actual.samples.native,actual.samples.reconstructed),
      samples:actual.samples
    };
    if(process.env.OBFS_FOUR_WAY_BROWSER_AUDIT_FILE)
      await atomicWrite(process.env.OBFS_FOUR_WAY_BROWSER_AUDIT_FILE,
        JSON.stringify(browserEvidence,null,2)+'\n');
    process.stdout.write('MINIFIED_FOUR_WAY_CHROMIUM '+
      JSON.stringify(browserEvidence)+'\n');
  }finally{
    await new Promise((resolve,reject)=>server.close(
      error=>error?reject(error):resolve(true)));
  }
}
if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
