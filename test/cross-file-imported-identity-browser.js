'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {transform}=require('esbuild');
const {obfuscateFiles}=require('../src');
const {pairedBudgetBound}=require('../sims/paired-budget-bound');

/** @typedef {{path:string,sourceType:'module',code:string}} Input */
/** @typedef {{path:string,code:string}} Output */
/** @typedef {{native:number[],minified:number[],compiled:number[]}} Timings */

/**
 * A browser-valid cross-file identity-forwarding graph. Public host callbacks
 * receive only primitive results: the protected object never escapes to
 * caller-owned JavaScript. The unsafe ownKeys variant is a negative control.
 *
 * @param {boolean} reflective
 * @param {number} [depth]
 * @returns {Input[]}
 */
function graph(reflective,depth=1){
  const additional=Array.from({length:depth-1},(_,i)=>
    'const relay'+i+'='+(i===0?'forward':'relay'+(i-1))+';').join('');
  const target=depth===1?'forward':'relay'+(depth-2);
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:17,otherField:5};'},
    {path:'identity.mjs',sourceType:'module',
      code:'export const identity=x=>x;'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";'+
        'import {identity} from "./identity.mjs";'+
        'const forward=identity;'+additional+
        'export function run(a){const result='+target+'(state);'+
        (reflective?'return [Object.keys(result),result.secretField+a];':
          'return (result.secretField+a)^result.otherField;')+'}'}
  ];
}

/** @param {Input[]} input @returns {Output[]} */
function compile(input){
  const built=obfuscateFiles(input,{
    mode:'coo',closedWorld:true,
    seed:'browser-cross-imported-identity-alias-'+
      (input[2].code.includes('Object.keys')?'reflection':'positive'),
    identifiers:false,strings:false,properties:true
  });
  const reflective=input[2].code.includes('Object.keys');
  assert.equal(built.crossFile.objects,reflective?0:1);
  assert.equal(built.crossFile.properties,reflective?0:2);
  return built.files.map(file=>({path:file.path,code:String(file.code)}));
}

/**
 * Test the exact same native/published ESM graph and a reflexive-key
 * rejection in real Chrome. Timed work includes only repeated pure
 * entry calls, not compilation, import, input creation or callback hashing.
 * @returns {Promise<void>}
 */
async function main(){
  /** @type {Map<string,{body:string,type:string}>} */
  const assets=new Map([
    ['/index.html',{body:'<!doctype html><html><head><meta charset="utf-8"></head><body>Cross-file identity proof</body></html>',
      type:'text/html; charset=utf-8'}]
  ]);
  for(const [name,reflective,depth] of /** @type {[string,boolean,number][]} */ (
    [['positive',false,1],['transitive',false,3],['reflective',true,1]])){
    const original=graph(reflective,depth),compiled=compile(original);
    /** @type {Output[]} */
    const minified=await Promise.all(original.map(async file=>({
      path:file.path,
      code:(await transform(file.code,{
        format:'esm',loader:'js',target:'es2022',sourcefile:file.path,
        minify:true,legalComments:'none'
      })).code
    })));
    for(const [variant,files] of /** @type {[string,Input[]|Output[]][]} */ (
      [['native',original],['minified',minified],['compiled',compiled]])){
      for(const file of files)
        assets.set('/'+name+'/'+variant+'/'+file.path,
          {body:file.code,type:'text/javascript; charset=utf-8'});
    }
  }
  const server=http.createServer((request,response)=>{
    const asset=assets.get(request.url??'');
    if(request.method!=='GET'||!asset){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'Content-Type':asset.type,
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"script-src 'self'"
    });
    response.end(asset.body);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    /** @type {Promise<void>} */
    const listening=new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve());
    });
    await listening;
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:'+address.port+'/index.html',
      {waitUntil:'domcontentloaded',timeout:45000});
    const data=await page.evaluate(async()=>{
      /** @type {Timings} */
      const time={native:[],minified:[],compiled:[]};
      const expected=(/** @type {string} */ (JSON.stringify(['secretField','otherField'])));
      const positiveNative='/positive/native/entry.mjs';
      const positiveMinified='/positive/minified/entry.mjs';
      const positiveCompiled='/positive/compiled/entry.mjs';
      const transitiveNative='/transitive/native/entry.mjs';
      const transitiveCompiled='/transitive/compiled/entry.mjs';
      const negativeNative='/reflective/native/entry.mjs';
      const negativeCompiled='/reflective/compiled/entry.mjs';
      const baseline=/** @type {{run:(a:number)=>number}} */(
        await import(positiveNative));
      const ordinaryMinified=/** @type {{run:(a:number)=>number}} */ (
        await import(positiveMinified));
      const protectedGraph=/** @type {{run:(a:number)=>number}} */ (
        await import(positiveCompiled));
      const transitiveBaseline=/** @type {{run:(a:number)=>number}} */ (
        await import(transitiveNative));
      const transitiveCandidate=/** @type {{run:(a:number)=>number}} */ (
        await import(transitiveCompiled));
      const reflectiveBaseline=/** @type {{run:(a:number)=>[string[],number]}} */ (
        await import(negativeNative));
      const reflectiveCandidate=/** @type {{run:(a:number)=>[string[],number]}} */ (
        await import(negativeCompiled));
      let parity=0;
      for(let i=0;i<4096;i++){
        const native=baseline.run(i);
        if(!Object.is(native,protectedGraph.run(i))||
           !Object.is(native,ordinaryMinified.run(i)))
          throw Error('Browser cross-file positive or minifier mismatch at '+i);
        if(!Object.is(transitiveBaseline.run(i),transitiveCandidate.run(i)))
          throw Error('Browser transitive alias differential mismatch at '+i);
        const reflected=reflectiveBaseline.run(i);
        const transformed=reflectiveCandidate.run(i);
        if(JSON.stringify(reflected)!==JSON.stringify(transformed)||
            JSON.stringify(reflected[0])!==expected)
          throw Error('Browser reflective refusal mismatch at '+i);
        parity++;
      }
      // Source-visible host APIs only consume values. An external observer of
      // the protected object shape is deliberately OUTSIDE closedWorld:true.
      /** @type {number[]} */
      const collected=[];
      (/** @type {any} */ (globalThis)).externalBridge={
        /** @param {number} value */
        accept(value){collected.push(value);}
      };
      /** @param {(value:number)=>number} fn @param {number} iterations */
      function timed(fn,iterations){
        let checksum=0;
        const start=performance.now();
        for(let i=0;i<iterations;i++){
          const value=fn(i);
          checksum^=value;
          if(i%8191===0)
            (/** @type {any} */ (globalThis)).externalBridge.accept(value);
        }
        const ms=performance.now()-start;
        if(!Number.isFinite(ms)||ms<=0)throw Error('No browser CPU witness');
        return {ms,checksum};
      }
      for(let i=0;i<4;i++){
        timed(baseline.run,65536);
        timed(ordinaryMinified.run,65536);
        timed(protectedGraph.run,65536);
      }
      const orders=[
        ['native','minified','compiled'],
        ['compiled','minified','native'],
        ['minified','native','compiled'],
        ['compiled','native','minified'],
        ['native','compiled','minified'],
        ['minified','compiled','native']
      ];
      for(let trial=0;trial<12;trial++){
        const order=orders[trial%orders.length];
        /** @type {number|undefined} */
        let checksum;
        for(const variant of order){
          const fn=variant==='native'?baseline.run:
            variant==='minified'?ordinaryMinified.run:protectedGraph.run;
          const result=timed(fn,100000);
          if(checksum!==undefined&&result.checksum!==checksum)
            throw Error('Browser benchmark checksum mismatch '+variant);
          if(checksum===undefined)checksum=result.checksum;
          time[/** @type {'native'|'minified'|'compiled'} */ (variant)].push(result.ms);
        }
      }
      return {trace:{
        typedInputs:parity,hostCallbacks:collected.length,
        outputParity:true,transitiveParity:true,reflectiveRefusalParity:true,
        benchmarkChecksumsMatched:true
      },time};
    });
    assert.equal(data.trace.typedInputs,4096);
    assert.ok(data.trace.hostCallbacks>0);
    assert.equal(data.trace.outputParity,true);
    assert.equal(data.trace.reflectiveRefusalParity,true);
    assert.equal(data.trace.transitiveParity,true);
    assert.equal(data.trace.benchmarkChecksumsMatched,true);
    const bound=pairedBudgetBound(data.time.native,data.time.compiled);
    const minifiedBound=pairedBudgetBound(data.time.minified,data.time.compiled);
    console.log('CROSS_FILE_IMPORTED_IDENTITY_CHROMIUM '+JSON.stringify({
      version:await browser.version(),
      positiveFieldsRenamed:2,
      transitiveFieldsRenamed:2,
      reflectiveFieldsRenamed:0,
      cases:4096,callbackCount:data.trace.hostCallbacks,
      fullOutputParity:true,transitiveOutputParity:true,
      reflectiveKeyParity:true,
      nativeVsCompiled:bound,
      minifiedVsCompiled:minifiedBound,
      strictObservedBreaches:bound.samplePairs-bound.observedPairsWithinBudget,
      strictObservedMinifiedBreaches:minifiedBound.samplePairs-minifiedBound.observedPairsWithinBudget,
      timingMs:data.time,
      caveat:'The minified graph is unbundled ES2022 esbuild with properties preserved. The graph is closed under the compiler declaration; hostile outside consumers can inspect the published state module. The 12-pair browser loop is a bounded performance sample.'
    }));
  }finally{
    try{if(browser)await browser.close();}
    finally{
      /** @type {Promise<void>} */
      const closed=new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve()));
      await closed;
    }
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
