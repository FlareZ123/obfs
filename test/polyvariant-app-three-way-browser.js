'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {prepare}=require('../sims/polyvariant-app-three-way-budget');

/** @param {string} text @returns {string} */
function digest(text){return createHash('sha256').update(text).digest('hex');}

/** @param {number} count @returns {{kind:string,payload:string}[]} */
function records(count){
  return Array.from({length:count},(_,index)=>({
    kind:['start','tick','pause','stop'][index%4],
    payload:'data-'+index+(index%11===0?'終':'')+(index%13===0?'🧪':'')
  }));
}

/**
 * @param {{runScenario:(seed:number,records:{kind:string,payload:string}[],host:{emit:(value:unknown)=>void})=>string}} fn
 * @param {number} count
 * @returns {{events:number,outputSha256:string,hostTraceSha256:string,emissions:number}}
 */
function observeNode(fn,count){
  const trace=/** @type {unknown[]} */([]);
  const output=fn.runScenario(-817,records(count),{emit(value){trace.push(value);}});
  return {events:count,outputSha256:digest(output),
    hostTraceSha256:digest(JSON.stringify(trace)),emissions:trace.length};
}

/**
 * @param {Map<string,string>} published
 * @returns {string}
 */
function page(published){
  assert.equal(published.size,9,'Expected precisely 3 x 3 distinct JS modules');
  return `<!doctype html><html><meta charset="utf-8"><body><pre id="out">pending</pre>
<script type="module">
import {runScenario as native} from "/native/entry.mjs";
import {runScenario as published} from "/published/entry.mjs";
import {runScenario as attacker} from "/reconstructed/entry.mjs";
const kinds=["start","tick","pause","stop"];
function events(count){
  return Array.from({length:count},(_,index)=>({
    kind:kinds[index%4],
    payload:"data-"+index+(index%11===0?"終":"")+(index%13===0?"🧪":"")
  }));
}
function observe(fn,input){
  const emitted=[];
  const output=fn(-817,input,{emit(value){emitted.push(value);}});
  return {output,trace:JSON.stringify(emitted),emissions:emitted.length};
}
async function sha(text){
  const bytes=new TextEncoder().encode(text);
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,"0")).join("");
}
const rows=[];
for(const count of [1,50,1000,10000]){
  const input=events(count);
  const expected=observe(native,input);
  for(const [name,fn] of [["published",published],["reconstructed",attacker]]){
    const actual=observe(fn,input);
    if(actual.output!==expected.output||actual.trace!==expected.trace||
      actual.emissions!==expected.emissions){
      document.getElementById("out").textContent="mismatch:"+name+":"+count;
      throw Error("Full browser application output/host callback mismatch");
    }
  }
  rows.push({events:count,outputSha256:await sha(expected.output),
    hostTraceSha256:await sha(expected.trace),emissions:expected.emissions});
}
document.getElementById("out").textContent="pass:"+JSON.stringify(rows);
</script></body></html>`;
}

/** @returns {Promise<void>} */
async function main(){
  const {variants,originalSha256,publishedSha256,reconstructedSha256}=await prepare();
  assert.notEqual(originalSha256,publishedSha256);
  assert.notEqual(publishedSha256,reconstructedSha256);
  /** @type {Map<string,string>} */
  const assets=new Map();
  for(const [name,group] of Object.entries(variants)){
    for(const file of group)assets.set('/'+name+'/'+file.path,file.code);
  }
  assets.set('/index.html',page(assets));
  const native=await import(pathToFileURL(
    path.join(__dirname,'../examples/polyvariant-app/native/entry.mjs')).href);
  const expected=[1,50,1000,10000].map(count=>observeNode(native,count));
  const server=http.createServer((request,response)=>{
    const key=request.url??'';
    if(request.method!=='GET'||!assets.has(key)){
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200,{
      'content-type':key.endsWith('.html')?
        'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(assets.get(key));
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(true));
    });
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const root='http://127.0.0.1:'+address.port;
    const emitted=await fetch(root+'/published/math.mjs');
    assert.equal(emitted.status,200);
    assert.equal(await emitted.text(),variants.published[0].code);
    const missing=await fetch(root+'/published/not-a-file.mjs');
    assert.equal(missing.status,404);
    const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'google-chrome',[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=12000','--dump-dom',root+'/index.html'
    ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
    const data=stdout.match(/<pre id="out">pass:(\[[^<]*\])<\/pre>/u)?.[1];
    assert.ok(data,'Browser did not complete three-way ESM: '+stdout.slice(-1800));
    const actual=/** @type {typeof expected} */(JSON.parse(data));
    assert.deepEqual(actual,expected);
    process.stdout.write('POLYVARIANT_THREE_WAY_CHROMIUM '+JSON.stringify({
      node:process.version,matchedWorkloads:actual.length,
      verifiedCompleteOutputs:true,verifiedExternalCallbacks:true,
      servedPublishedMathBytes:Buffer.byteLength(variants.published[0].code),
      publishedPublicSourceFetchedExactly:true,
      independentAttackerFunctionsRecovered:3,
      originalSha256,publishedSha256,reconstructedSha256,
      rows:actual
    })+'\n');
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(true)));
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
