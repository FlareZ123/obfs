'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {transform}=require('esbuild');
const {obfuscateFiles}=require('../src');

/**
 * One actual browser script with a direct top-level private const owner.
 * Its public surface contains only primitive timing and checksum results.
 * @param {boolean} reflective
 * @returns {string}
 */
function source(reflective) {
  const prefix='const seedValue=17;'+
    'const privateOwner={secretField:seedValue,otherField:5};';
  if(reflective)return prefix+
    'globalThis.__obfsReport={keys:Object.keys(privateOwner),'+
    'answer:privateOwner.secretField+privateOwner.otherField};';
  return prefix+
    'const timings=[],checksums=[];'+
    'for(let trial=0;trial<12;trial++){'+
    'let checksum=0;const started=performance.now();'+
    'for(let i=0;i<2000000;i++)'+
    'checksum^=((privateOwner.secretField+i)^privateOwner.otherField);'+
    'const elapsed=performance.now()-started;'+
    'if(trial>=3){timings.push(elapsed);checksums.push(checksum);}}'+
    'globalThis.__obfsReport={timings,checksums};';
}

/** @param {string} code @param {'module'|'script'} sourceType @returns {{code:string,renamed:number}} */
function compile(code,sourceType) {
  const result=obfuscateFiles([{path:sourceType==='module'?'main.mjs':'main.js',sourceType,code}],{
    mode:'coo',closedWorld:true,seed:'top-level-browser-primitive',
    identifiers:false,strings:false,properties:true
  });
  const file=result.files[0];
  return {code:file.code,renamed:file.metrics.properties};
}

/** @returns {Promise<void>} */
async function main() {
  const positive=source(false);
  const reflective=source(true);
  // Browser classic-script global lexicals are externally observable; the
  // private proof is intentionally only asserted for module-scope owners.
  const classic=compile(positive,'script');
  const compiled=compile(positive,'module');
  const declined=compile(reflective,'module');
  assert.equal(classic.renamed,0);
  assert.equal(compiled.renamed,2);
  assert.equal(declined.renamed,0);
  assert.doesNotMatch(compiled.code,/secretField|otherField/u);
  assert.match(declined.code,/secretField|otherField/u);
  const minified=(await transform(positive,{
    loader:'js',target:'es2022',minify:true,legalComments:'none'
  })).code;
  assert.match(minified,/secretField|otherField/u);

  /** @type {Map<string,string>} */
  const scripts=new Map([
    ['/native.js',positive],['/minified.js',minified],
    ['/compiled.js',compiled.code],['/reflect-native.js',reflective],
    ['/reflect-compiled.js',declined.code]
  ]);
  const server=http.createServer((request,response)=>{
    const pathname=request.url??'';
    if(pathname==='/index.html') {
      response.writeHead(200,{
        'Content-Type':'text/html; charset=utf-8',
        'Content-Security-Policy':"default-src 'self'; script-src 'self'",
        'Cache-Control':'no-store'
      });
      response.end('<!doctype html><html><meta charset="utf-8"><title>Local owner</title></html>');
      return;
    }
    const script=scripts.get(pathname);
    if(request.method!=='GET'||script===undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200,{
      'Content-Type':'text/javascript; charset=utf-8',
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff'
    });
    response.end(script);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve());
    });
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    /**
     * @param {string} filename
     * @returns {Promise<{timings?:number[],checksums?:number[],keys?:string[],answer?:number}>}
     */
    async function run(filename) {
      assert.ok(browser);
      const page=await browser.newPage();
      try {
        await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded',timeout:45000});
        return await page.evaluate(async url=>{
          await import(url);
          return (/** @type {any} */ (globalThis)).__obfsReport;
        },origin+filename);
      }finally{await page.close();}
    }
    const native=await run('/native.js');
    const ordinary=await run('/minified.js');
    const protectedResult=await run('/compiled.js');
    const reflectedNative=await run('/reflect-native.js');
    const reflectedOutput=await run('/reflect-compiled.js');
    assert.deepEqual(reflectedOutput,reflectedNative);
    assert.deepEqual(reflectedOutput.keys,['secretField','otherField']);
    assert.deepEqual(protectedResult.checksums,native.checksums);
    assert.deepEqual(ordinary.checksums,native.checksums);
    assert.ok(native.timings&&ordinary.timings&&protectedResult.timings);
    assert.equal(native.timings.length,9);
    assert.equal(ordinary.timings.length,9);
    assert.equal(protectedResult.timings.length,9);
    /** @param {number[]} sample */
    function median(sample) {
      const sorted=[...sample].sort((a,b)=>a-b);
      return sorted[Math.floor(sorted.length/2)];
    }
    const originalMs=median(native.timings);
    const minifiedMs=median(ordinary.timings);
    const compiledMs=median(protectedResult.timings);
    const ratio=compiledMs/originalMs;
    assert.ok(originalMs>0&&minifiedMs>0&&compiledMs>0);
    assert.ok(ratio<=2.5,'Repeated browser compute must respect 2.5x for this sample');
    process.stdout.write('LOCAL_TOP_PRIMITIVE_CHROME '+JSON.stringify({
      samples:9,iterationsPerSample:2000000,
      originalMs,minifiedMs,compiledMs,ratioNative:ratio,
      ratioMinified:compiledMs/minifiedMs,
      reflectionPreserved:true,privatePropertiesRenamed:compiled.renamed
    })+'\n');
  }finally {
    await browser?.close();
    await new Promise(resolve=>server.close(()=>resolve()));
  }
}

if(require.main===module)
  main().catch(error=>{console.error(error);process.exitCode=1;});

module.exports={main,source};
