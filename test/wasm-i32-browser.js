'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');
const {pairedBudgetBound}=require('../sims/paired-budget-bound');

/**
 * Run real browser ESM imports and host-page API calls. Differential inputs
 * are signed Int32 Numbers under the experimental backend's contract.
 * Paired warm computation is measured separately from browser/page startup.
 * @returns {Promise<void>}
 */
async function main() {
  const source='function scramble(x){return (((x^137)&(x>>>3))|(x<<7));}'+
    'export function run(x){return scramble(x);}';
  const built=obfuscateFiles([{path:'scramble.mjs',sourceType:'module',code:source}],{
    mode:'coo',seed:'wasm-i32-browser-2026-11-15',
    strings:false,properties:false,identifiers:false,
    experimentalWasmI32:{'scramble.mjs':['scramble']}
  });
  assert.equal(built.files[0].metrics.wasmI32Functions,1);
  const transformed=String(built.files[0].code);
  assert.ok(transformed.includes('WebAssembly.Module('));

  const tripleSource='function fuse(a,b,c){return (((a^b)&(c>>>3))|((b<<c)^0x13579));}'+
    'export function run(a,b,c){return fuse(a,b,c);}';
  const tripleBuilt=obfuscateFiles([
    {path:'fuse.mjs',sourceType:'module',code:tripleSource}
  ],{
    mode:'coo',seed:'wasm-i32-multi-browser-2026-11-16',
    strings:false,properties:false,identifiers:false,
    experimentalWasmI32:{'fuse.mjs':['fuse']}
  });
  assert.equal(tripleBuilt.files[0].metrics.wasmI32Functions,1);
  const tripleTransformed=String(tripleBuilt.files[0].code);
  const page=[
    "<!doctype html><html><meta charset=\"utf-8\"><body><div id=\"answer\">pending</div>",
    "<script>",
    "window.externalBridge={accept(value){",
    "  document.getElementById('answer').textContent=value;",
    "}};",
    "window.addEventListener('error',event=>{",
    "  document.getElementById('answer').textContent='fail:'+event.message;",
    "});",
    "window.addEventListener('unhandledrejection',event=>{",
    "  document.getElementById('answer').textContent='fail:'+String(event.reason);",
    "});",
    "</script>",
    "<script type=\"module\">",
    "import {run as native} from \"/native.mjs\";",
    "import {run as encoded} from \"/encoded.mjs\";",
    "import {run as native3} from \"/native3.mjs\";",
    "import {run as encoded3} from \"/encoded3.mjs\";",
    "let compared=0;",
    "for(let i=-2048;i<=2048;i++){",
    "  if(!Object.is(native(i),encoded(i)))throw Error('i32 mismatch '+i);",
    "  compared++;",
    "}",
    "let compared3=0;",
    "for(let i=-512;i<=512;i++){",
    "  const a=i|0,b=(i*1664525)|0,c=(i*69069)|0;",
    "  if(!Object.is(native3(a,b,c),encoded3(a,b,c)))",
    "    throw Error('three-arg mismatch '+i);",
    "  compared3++;",
    "}",
    "function singleWork(fn){",
    "  let value=0;",
    "  for(let i=0;i<2000000;i++)value^=fn((i*1664525)|0);",
    "  return value;",
    "}",
    "function multiWork(fn){",
    "  let value=0;",
    "  for(let i=0;i<2000000;i++){",
    "    const a=(i*1664525)|0,b=(i*69069)|0,c=(i&31)|0;",
    "    value^=fn(a,b,c);",
    "  }",
    "  return value;",
    "}",
    "let clockChecksum=0;",
    "const clockStart=performance.now();",
    "for(let i=0;i<5000000;i++)clockChecksum=(clockChecksum+(i^0x9e37))|0;",
    "const clockProbeMs=performance.now()-clockStart;",
    "if(!Number.isFinite(clockProbeMs)||clockProbeMs<0.1)",
    "  throw Error('Chromium synchronous monotonic clock did not advance');",
    "const singleExpected=singleWork(native),multiExpected=multiWork(native3);",
    "for(let k=0;k<5;k++){",
    "  if(singleWork(native)!==singleExpected||singleWork(encoded)!==singleExpected||",
    "     multiWork(native3)!==multiExpected||multiWork(encoded3)!==multiExpected)",
    "    throw Error('Wasm warmup checksum differs from native');",
    "}",
    "function timed(fn,work,expected){",
    "  const started=performance.now();",
    "  const checksum=work(fn);",
    "  const elapsed=performance.now()-started;",
    "  if(checksum!==expected||!Number.isFinite(elapsed)||elapsed<=0)",
    "    throw Error('Invalid Wasm browser synchronous CPU sample');",
    "  return elapsed;",
    "}",
    "const samples={",
    "  single:{native:[],wasm:[]},",
    "  multi:{native:[],wasm:[]}",
    "};",
    "for(let trial=0;trial<12;trial++){",
    "  const order=trial%2===0?['native','wasm']:['wasm','native'];",
    "  for(const name of order)",
    "    samples.single[name].push(timed(name==='native'?native:encoded,singleWork,singleExpected));",
    "  for(const name of order)",
    "    samples.multi[name].push(timed(name==='native'?native3:encoded3,multiWork,multiExpected));",
    "}",
    "window.externalBridge.accept('pass:'+JSON.stringify({",
    "  inputs:compared,multiInputs:compared3,clockProbeMs,clockChecksum,",
    "  singleExpected,multiExpected,samples",
    "}));",
    "</script></body></html>"
  ].join('\n');
  const assets=new Map([
    ['/index.html',{type:'text/html; charset=utf-8',body:page}],
    ['/native.mjs',{type:'text/javascript; charset=utf-8',body:source}],
    ['/encoded.mjs',{type:'text/javascript; charset=utf-8',body:transformed}],
    ['/native3.mjs',{type:'text/javascript; charset=utf-8',body:tripleSource}],
    ['/encoded3.mjs',{type:'text/javascript; charset=utf-8',body:tripleTransformed}]
  ]);
  const server=http.createServer((request,response)=>{
    const selected=assets.get(request.url??'');
    if(request.method!=='GET'||!selected){response.writeHead(404).end();return;}
    response.writeHead(200,{'Content-Type':selected.type,'Cache-Control':'no-store'});
    response.end(selected.body);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browserSession;
  try{
    /** @type {Promise<void>} */
    const listening=new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve());
    });
    await listening;
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const url='http://127.0.0.1:'+address.port+'/index.html';
    browserSession=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const chromeVersion=await browserSession.version();
    const tab=await browserSession.newPage();
    await tab.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    await tab.waitForFunction(()=>{
      const text=document.getElementById('answer')?.textContent??'';
      return text.startsWith('pass:')||text.startsWith('fail:');
    },{timeout:90000,polling:50});
    const rendered=await tab.$eval('#answer',element=>element.textContent??'');
    assert.ok(rendered.startsWith('pass:'),
      'Wasm browser did not complete live ESM and host API checks: '+rendered.slice(0,2000));
    const actual=/** @type {{
      inputs:number,multiInputs:number,clockProbeMs:number,clockChecksum:number,
      singleExpected:number,multiExpected:number,
      samples:{single:{native:number[],wasm:number[]},multi:{native:number[],wasm:number[]}}
    }} */ (JSON.parse(rendered.slice(5)));
    assert.equal(actual.inputs,4097);
    assert.equal(actual.multiInputs,1025);
    assert.ok(Number.isFinite(actual.clockProbeMs)&&actual.clockProbeMs>=0.1);
    for(const workload of [actual.samples.single,actual.samples.multi]){
      assert.equal(workload.native.length,12);
      assert.equal(workload.wasm.length,12);
      assert.ok([...workload.native,...workload.wasm].every(value=>
        Number.isFinite(value)&&value>0));
    }
    const singleBudget=pairedBudgetBound(actual.samples.single.native,actual.samples.single.wasm);
    const multiBudget=pairedBudgetBound(actual.samples.multi.native,actual.samples.multi.wasm);
    console.log('WASM_I32_REALCLOCK '+JSON.stringify({
      browser:'chromium',chromeVersion,inputs:actual.inputs,multiInputs:actual.multiInputs,
      clockProbeMs:actual.clockProbeMs,clockChecksum:actual.clockChecksum,
      warmupPass:true,trialPairs:12,pairedOrderCounterbalanced:true,
      hotRatio:singleBudget.ratioOfMedians,
      singleBudget,multiBudget,
      strictObservedBreaches:{
        single:singleBudget.samplePairs-singleBudget.observedPairsWithinBudget,
        multi:multiBudget.samplePairs-multiBudget.observedPairsWithinBudget
      },
      samples:actual.samples
    }));
  }finally{
    try{
      if(browserSession)await browserSession.close();
    }finally{
      /** @type {Promise<void>} */
      const closing=new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve()));
      await closing;
    }
  }
}
if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
