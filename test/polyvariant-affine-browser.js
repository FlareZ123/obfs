'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {pairedBudgetBound}=require('../sims/paired-budget-bound');
const {obfuscateFiles}=require('../src');

/**
 * This evaluates genuine browser and emitted functions with the same strict
 * native-observed input contract. The Chrome session and clock are real-time.
 * @returns {Promise<void>}
 */
async function main(){
  const original=(await fs.readFile(path.join(__dirname,
    '../examples/polyvariant-affine/original.cjs'),'utf8'))
    .replace(/\r\n/g,'\n').replace('function guardedTotal',
    'export function guardedTotal').replace('module.exports=guardedTotal;','');
  /** @type {Map<string,string>} */
  const assets=new Map([['/native.mjs',original]]);
  for(const count of /** @type {const} */ ([2,4,8])){
    const output=obfuscateFiles([{
      path:'value.mjs',sourceType:'module',code:original
    }],{
      mode:'coo',seed:'polyvariant-chrome-'+count,
      strings:false,properties:false,identifiers:false,
      experimentalPolyvariantAffine:{'value.mjs':['guardedTotal']},
      experimentalPolyvariantCount:count
    });
    assert.equal(output.files[0].metrics.polyvariantPaths,count);
    assets.set('/v'+count+'.mjs',
      /** @type {string} */ (output.files[0].code));
  }
  const page=[
    "<!doctype html><html><meta charset=\"utf-8\"><body><div id=\"answer\">pending</div>",
    "<script>",
    "window.addEventListener('error',event=>{",
    "  document.getElementById('answer').textContent='fail:'+event.message;",
    "});",
    "window.addEventListener('unhandledrejection',event=>{",
    "  document.getElementById('answer').textContent='fail:'+String(event.reason);",
    "});",
    "</script>",
    "<script type=\"module\">",
    "import {guardedTotal as native} from \"/native.mjs\";",
    "import {guardedTotal as v2} from \"/v2.mjs\";",
    "import {guardedTotal as v4} from \"/v4.mjs\";",
    "import {guardedTotal as v8} from \"/v8.mjs\";",
    "const variants={native,v2,v4,v8};",
    "function result(fn,input){",
    "  try{return [\"ok\",fn(input)];}",
    "  catch(error){return [\"throw\",error.name,error.message];}",
    "}",
    "const inputs=[0,-0,1,-1,NaN,Infinity,-Infinity,-2147483649,2147483648,",
    "  \"47\",\"\",false,true,null,undefined,Symbol(\"tag\"),0n,3n,{}];",
    "for(let i=-4096;i<4096;i++)inputs.push(i);",
    "for(const input of inputs){",
    "  const expected=result(native,input);",
    "  for(const fn of [v2,v4,v8]){",
    "    if(JSON.stringify(result(fn,input))!==JSON.stringify(expected))",
    "      throw Error('Native and polyvariant result diverged: '+String(input));",
    "  }",
    "}",
    "function work(fn){",
    "  let checksum=0;",
    "  for(let i=0;i<2000000;i++)",
    "    checksum^=fn((Math.imul(i,1103515245)^12345)|0);",
    "  return checksum;",
    "}",
    "let clockChecksum=0;",
    "const clockStart=performance.now();",
    "for(let i=0;i<5000000;i++)clockChecksum=(clockChecksum+(i^0x9e37))|0;",
    "const clockProbeMs=performance.now()-clockStart;",
    "if(!Number.isFinite(clockProbeMs)||clockProbeMs<0.1)",
    "  throw Error('Actual CPU clock failed liveness control');",
    "const expectedHotChecksum=work(native);",
    "for(let warm=0;warm<8;warm++)",
    "  for(const fn of Object.values(variants))",
    "    if(work(fn)!==expectedHotChecksum)throw Error('Invalid warm checksum');",
    "function timed(fn){",
    "  const start=performance.now();",
    "  const checksum=work(fn);",
    "  const elapsed=performance.now()-start;",
    "  if(checksum!==expectedHotChecksum||!Number.isFinite(elapsed)||elapsed<=0)",
    "    throw Error('Invalid synchronous CPU sample or checksum');",
    "  return elapsed;",
    "}",
    "const samples={native:[],v2:[],v4:[],v8:[]};",
    "const orders=[",
    "  [\"native\",\"v2\",\"v4\",\"v8\"],",
    "  [\"v8\",\"v4\",\"v2\",\"native\"],",
    "  [\"v2\",\"native\",\"v8\",\"v4\"],",
    "  [\"v4\",\"v8\",\"native\",\"v2\"]",
    "];",
    "for(let trial=0;trial<12;trial++)",
    "  for(const name of orders[trial%orders.length])",
    "    samples[name].push(timed(variants[name]));",
    "document.getElementById('answer').textContent='pass:'+JSON.stringify({",
    "  inputs:inputs.length,clockProbeMs,clockChecksum,expectedHotChecksum,samples",
    "});",
    "</script></body></html>"
  ].join('\n');
  assets.set('/index.html',page);
  const server=http.createServer((req,res)=>{
    const url=req.url??'';
    const body=assets.get(url);
    if(req.method!=='GET'||body===undefined){
      res.writeHead(404).end();return;
    }
    res.writeHead(200,{
      'Content-Type':url.endsWith('.html')?
        'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'Cache-Control':'no-store'
    });
    res.end(body);
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
      'Live Chromium polyvariant benchmark failed: '+rendered.slice(0,2000));
    const actual=/** @type {{
      inputs:number,clockProbeMs:number,clockChecksum:number,
      expectedHotChecksum:number,
      samples:{native:number[],v2:number[],v4:number[],v8:number[]}
    }} */ (JSON.parse(rendered.slice(5)));
    assert.equal(actual.inputs,8211);
    assert.ok(Number.isFinite(actual.clockProbeMs)&&actual.clockProbeMs>=0.1,
      'Chromium clock did not advance for consumed synchronous CPU work');
    for(const samples of Object.values(actual.samples)){
      assert.equal(samples.length,12);
      assert.ok(samples.every(value=>Number.isFinite(value)&&value>0));
    }
    const comparisons=Object.fromEntries(/** @type {const} */([2,4,8]).map(count=>[
      count,pairedBudgetBound(actual.samples.native,
        actual.samples[/** @type {'v2'|'v4'|'v8'} */ ('v'+count)])
    ]));
    const ratios=Object.fromEntries(/** @type {const} */([2,4,8]).map(count=>[
      count,comparisons[count].ratioOfMedians.toFixed(3)
    ]));
    console.log('POLYVARIANT_AFFINE_REALCLOCK '+JSON.stringify({
      browser:'chromium',chromeVersion,inputs:actual.inputs,
      clockProbeMs:actual.clockProbeMs,clockChecksum:actual.clockChecksum,
      expectedHotChecksum:actual.expectedHotChecksum,
      selectedVariants:[2,4,8],trialsPerVariant:12,
      pairedOrderCounterbalanced:true,ratios,comparisons,samples:actual.samples
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
