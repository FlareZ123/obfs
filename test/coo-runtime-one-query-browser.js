'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {build}=require('../examples/polyvariant-app/build.cjs');

/** @returns {string} */
function page(){return "<!doctype html><html><meta charset=\"utf-8\"><body><pre id=\"out\">pending</pre><script>\nwindow.addEventListener('error',event=>{\n  document.getElementById(\"out\").textContent=\"fail:\"+event.message;\n});\nwindow.addEventListener('unhandledrejection',event=>{\n  document.getElementById(\"out\").textContent=\"fail:\"+String(event.reason);\n});\n</script><script type=\"module\">\nlet clockChecksum=0;\nconst clockStarted=performance.now();\nfor(let i=0;i<5000000;i++)clockChecksum=(clockChecksum+(i^0x9e37))|0;\nconst clockProbeMs=performance.now()-clockStarted;\nif(!Number.isFinite(clockProbeMs)||clockProbeMs<0.1)\n  throw Error(\"CPU monotonic clock failed positive control\");\nconst start=performance.now();\nconst exposed=await import(\"/published/math.mjs\");\nconst imported=performance.now();\nconst names=[\"round1\",\"round2\",\"round3\"],offsets={},clone={};\nlet oracleCalls=0;\nfor(const name of names){\n  offsets[name]=exposed[name](0);\n  oracleCalls++;\n  if(!Number.isInteger(offsets[name])||offsets[name]<-2147483648||\n     offsets[name]>2147483647)throw Error(\"Unexpected public output\");\n}\n// Commit to the arithmetic model before evaluating held-out inputs.\nfor(const name of names){\n  const offset=offsets[name];\n  clone[name]=value=>((value|0)+offset)|0;\n}\nconst finished=performance.now();\nconst attackMs=finished-start;\nconst importMs=imported-start;\nconst queryAndFitMs=finished-imported;\nfunction invoke(fn,value){\n  try{return \"return:\"+String(fn(value));}\n  catch(error){return \"throw:\"+error.name+\":\"+error.message;}\n}\nconst special=[-2147483648,-1,-0,0,1,2147483647,2147483648,\n  Number.MAX_SAFE_INTEGER,NaN,Infinity,-Infinity,0.125,null,undefined,true,\n  false,\"17\",\"not-a-number\",Symbol(\"s\"),1n];\nlet heldout=0,coercions=0;\nfor(const name of names){\n  for(const value of special){\n    if(invoke(clone[name],value)!==invoke(exposed[name],value))\n      throw Error(\"Special primitive mismatch \"+name);\n    heldout++;\n  }\n  for(let trial=0;trial<4096;trial++){\n    const value=(Math.imul(trial^0x47d6a21e,0x9e3779b1)^0x6f13a4e2)|0;\n    if(clone[name](value)!==exposed[name](value))\n      throw Error(\"Signed Int32 mismatch \"+name+\"/\"+trial);\n    heldout++;\n  }\n  for(const primitive of [5,\"8\",null,undefined,Symbol(\"x\"),1n]){\n    let nativeCalls=0,recoveredCalls=0;\n    const native={ [Symbol.toPrimitive](){nativeCalls++;return primitive;} };\n    const recovered={ [Symbol.toPrimitive](){recoveredCalls++;return primitive;} };\n    if(invoke(clone[name],recovered)!==invoke(exposed[name],native)||\n       recoveredCalls!==nativeCalls||recoveredCalls!==1)\n      throw Error(\"Coercion mismatch \"+name);\n    coercions++;\n  }\n}\ndocument.getElementById(\"out\").textContent=\"pass:\"+\n  JSON.stringify({offsets,oracleCalls,attackMs,importMs,queryAndFitMs,clockProbeMs,clockChecksum,heldout,coercions});\n</script></body></html>";}

/**
 * Browser imports only the compiler-published ESM module, probes each
 * exported affine leaf once, and then checks held-out numeric values.
 * No original code or compiler implementation is served to Chromium.
 *
 * @returns {Promise<object>}
 */
async function main(){
  const output=await build();
  assert.equal(output.files[0].metrics.polyvariantFunctions,3);
  assert.equal(output.files[0].metrics.polyvariantPaths,6);
  const publicMath=/** @type {string} */(output.files[0].code);
  let mathRequests=0;
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browserSession;
  const server=http.createServer((request,response)=>{
    if(request.method==='GET'&&request.url==='/published/math.mjs'){
      mathRequests++;
      response.writeHead(200,{'content-type':'text/javascript; charset=utf-8',
        'cache-control':'no-store'});
      response.end(publicMath);
    }else if(request.method==='GET'&&request.url==='/index.html'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8',
        'cache-control':'no-store'});
      response.end(page());
    }else{
      response.writeHead(404).end();
    }
  });
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(true)));
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const root='http://127.0.0.1:'+address.port;
    browserSession=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const chromeVersion=await browserSession.version();
    const tab=await browserSession.newPage();
    await tab.goto(root+'/index.html',{waitUntil:'domcontentloaded',timeout:45000});
    await tab.waitForFunction(()=>{
      const text=document.getElementById('out')?.textContent??'';
      return text.startsWith('pass:')||text.startsWith('fail:');
    },{timeout:60000,polling:50});
    const rendered=await tab.$eval('#out',element=>element.textContent??'');
    assert.ok(rendered.startsWith('pass:'),
      'Live Chromium three-query recovery incomplete: '+rendered.slice(0,1800));
    const result=/** @type {{
      offsets:Record<string,number>,oracleCalls:number,attackMs:number,
      importMs:number,queryAndFitMs:number,clockProbeMs:number,
      clockChecksum:number,heldout:number,coercions:number
    }} */ (JSON.parse(rendered.slice(5)));
    assert.equal(mathRequests,1);
    assert.equal(result.oracleCalls,3);
    assert.equal(result.heldout,3*(4096+20));
    assert.equal(result.coercions,3*6);
    assert.ok(Number.isFinite(result.clockProbeMs)&&result.clockProbeMs>=0.1);
    assert.ok(Number.isFinite(result.attackMs)&&result.attackMs>0);
    assert.ok(Number.isFinite(result.importMs)&&result.importMs>0);
    assert.ok(Number.isFinite(result.queryAndFitMs)&&result.queryAndFitMs>=0);
    assert.ok(Math.abs(result.importMs+result.queryAndFitMs-result.attackMs)<1e-6);
    const reference=await import(pathToFileURL(path.join(__dirname,
      '../examples/polyvariant-app/native/math.mjs')).href);
    for(const name of ['round1','round2','round3'])
      assert.equal(result.offsets[name],reference[name](0));
    const summary={node:process.version,platform:process.platform,
      browser:'Chromium real-time ESM import',chromeVersion,mathRequests,
      observedFunctions:result.oracleCalls,heldoutComparisons:result.heldout,
      observableCoercionProbes:result.coercions,
      approximateModuleLoadAndThreeProbeMs:result.attackMs,
      moduleImportMs:result.importMs,queryAndFitMs:result.queryAndFitMs,
      cpuClockProbeMs:result.clockProbeMs,cpuClockChecksum:result.clockChecksum,
      preservedExports:Object.keys(result.offsets)};
    process.stdout.write('COO_RUNTIME_BROWSER_THREE_PROBES '+JSON.stringify(summary)+'\n');
    return summary;
  }finally{
    try{
      if(browserSession)await browserSession.close();
    }finally{
      await new Promise((resolve,reject)=>server.close(
        error=>error?reject(error):resolve(true)));
    }
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
