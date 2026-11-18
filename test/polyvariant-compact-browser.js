'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');
const {recoverCompact}=require('../sims/polyvariant-compact-static-recover');
const {pairedBudgetBound}=require('../sims/paired-budget-bound');

/**
 * Browser counterpart to the Node resident compact experiment: genuine
 * served JavaScript module bytes, seedless reconstruction and real CPU clock.
 * The output remains observable and statically reconstructable.
 * @returns {Promise<void>}
 */
async function main(){
  const original=await fs.readFile(path.join(__dirname,
    '../examples/polyvariant-app/native/math.mjs'),'utf8');
  const names=['round1','round2','round3'];
  const compiled=obfuscateFiles([{
    path:'math.mjs',code:original,sourceType:'module'
  }],{
    mode:'coo',seed:'compact-coo-browser-20261118',
    strings:false,properties:false,identifiers:false,
    experimentalPolyvariantAffine:{'math.mjs':names},
    experimentalPolyvariantCount:2,experimentalPolyvariantCompact:true
  });
  assert.equal(compiled.files[0].metrics.polyvariantFunctions,3);
  assert.equal(compiled.files[0].metrics.polyvariantPaths,6);
  const published=/** @type {string} */ (compiled.files[0].code);
  const recovered=recoverCompact(published,names).map(result=>
    'export '+result.source).join('\n');
  assert.ok(recovered.length<published.length);
  const page=`<!doctype html><meta charset="utf-8"><pre id="result">pending</pre>
<script>
window.addEventListener('error',event=>{
 document.querySelector('#result').textContent='fail:'+event.message;});
window.addEventListener('unhandledrejection',event=>{
 document.querySelector('#result').textContent='fail:'+String(event.reason);});
</script>
<script type="module">
import * as native from '/native.mjs';
import * as published from '/published.mjs';
import * as recovered from '/recovered.mjs';
const names=['round1','round2','round3'];
const values=[undefined,null,true,false,-0,0,1,-1,NaN,Infinity,
 -Infinity,2147483647,-2147483648,4294967295,-4294967297,
 '47','',0n,3n,Symbol('x')];
let state=0x46bb4ace;
for(let i=0;i<8192;i++){
 state=(Math.imul(state,1664525)+1013904223)|0;
 values.push(state);
}
function observation(fn,x){
 try{return {ok:true,value:fn(x)};}
 catch(error){return {ok:false,name:error.name};}
}
let checked=0;
for(const name of names){
 for(const value of values){
  const expected=observation(native[name],value);
  for(const variant of [published,recovered]){
   const actual=observation(variant[name],value);
   if(actual.ok!==expected.ok||actual.name!==expected.name||
      (actual.ok&&!Object.is(actual.value,expected.value)))
      throw Error('Mismatch '+name+':'+String(value));
  }
  checked++;
 }
}
function work(group){
 let value=0x4137109d;
 for(let i=0;i<2000000;i++){
  value=group.round1((value^i)|0);
  value=group.round2(value);
  value=group.round3(value);
 }
 return value;
}
let clockChecksum=0;
const clockStart=performance.now();
for(let i=0;i<5000000;i++)clockChecksum=(clockChecksum+(i^0x9e37))|0;
const clockProbeMs=performance.now()-clockStart;
if(clockProbeMs<0.1)throw Error('CPU clock did not advance');
const expected=work(native);
for(let i=0;i<4;i++){
 if(work(published)!==expected||work(recovered)!==expected)
  throw Error('Selected arithmetic changed');
}
const samples={native:[],published:[],recovered:[]};
const order=[['native','published','recovered'],
 ['recovered','native','published'],['published','recovered','native']];
for(let trial=0;trial<12;trial++){
 for(const name of order[trial%3]){
  const start=performance.now();
  const value=work({native,published,recovered}[name]);
  const duration=performance.now()-start;
  if(value!==expected||!Number.isFinite(duration)||duration<=0)
   throw Error('Invalid measured application call');
  samples[name].push(duration);
 }
}
document.querySelector('#result').textContent='pass:'+JSON.stringify({
 checked,clockProbeMs,clockChecksum,expected,samples
});
</script>`;
  const assets=new Map([
    ['/index.html',page],
    ['/native.mjs',original],
    ['/published.mjs',published],
    ['/recovered.mjs',recovered]
  ]);
  /** @type {Record<string,number>} */
  const requests={};
  const server=http.createServer((req,res)=>{
    const name=req.url??'';
    const body=assets.get(name);
    if(req.method!=='GET'||body===undefined){res.writeHead(404).end();return;}
    requests[name]=(requests[name]??0)+1;
    res.writeHead(200,{'content-type':name.endsWith('.html')?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8',
    'cache-control':'no-store'});
    res.end(body);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,args:['--no-sandbox','--disable-gpu',
        '--disable-dev-shm-usage','--no-first-run']
    });
    const pageSession=await browser.newPage();
    await pageSession.goto('http://127.0.0.1:'+address.port+'/index.html',{
      waitUntil:'domcontentloaded',timeout:45000
    });
    await pageSession.waitForFunction(()=>{
      const answer=document.querySelector('#result')?.textContent??'';
      return answer.startsWith('pass:')||answer.startsWith('fail:');
    },{timeout:90000,polling:50});
    const rendered=await pageSession.$eval('#result',element=>element.textContent??'');
    assert.ok(rendered.startsWith('pass:'),rendered.slice(0,500));
    const measured=/** @type {{checked:number,clockProbeMs:number,clockChecksum:number,expected:number,samples:{native:number[],published:number[],recovered:number[]}}} */ (
      JSON.parse(rendered.slice(5))
    );
    assert.equal(measured.checked,3*(8192+20));
    assert.ok(measured.clockProbeMs>=0.1);
    assert.equal(requests['/native.mjs'],1);
    assert.equal(requests['/published.mjs'],1);
    assert.equal(requests['/recovered.mjs'],1);
    const publishedBound=pairedBudgetBound(measured.samples.native,
      measured.samples.published);
    const recoveredBound=pairedBudgetBound(measured.samples.native,
      measured.samples.recovered);
    console.log('COMPACT_COO_BROWSER '+JSON.stringify({
      browserVersion:await browser.version(),checked:measured.checked,
      sourceBytes:{native:original.length,published:published.length,
        recovered:recovered.length},
      clockProbeMs:measured.clockProbeMs,
      expected:measured.expected,requests,publishedBound,recoveredBound,
      samples:measured.samples
    }));
  }finally{
    if(browser)await browser.close();
    await new Promise((resolve,reject)=>server.close(error=>
      error?reject(error):resolve()));
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
